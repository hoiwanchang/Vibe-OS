<script setup lang="ts">
/**
 * 下载中心窗口（P1）
 * - 工具栏：新建下载 / 全部暂停 / 全部开始 / 限速设置
 * - 下载列表：进度条 + 速率 + ETA + 连接数，活动任务 2s 轮询
 * - 新建下载：URL 多行批量 + 磁力链接自动识别
 * - 全局设置：el-drawer（并发 / 限速 / 默认目录 / BT 端口）
 * - 状态栏：活动 / 等待 / 已完成 / 总速度
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { Plus, Setting, VideoPause, VideoPlay } from '@element-plus/icons-vue';
import { useDownloadStore } from '@/stores/download';
import type { DownloadTask } from '@/api/types';
import { formatBytes } from '@/utils/format';

const { t } = useI18n();

const download = useDownloadStore();

/** 新建下载对话框 */
const addVisible = ref(false);
const addUrls = ref('');
const addDir = ref('');
const adding = ref(false);

/** 设置抽屉 */
const settingsVisible = ref(false);
const settingsForm = ref<Record<string, string>>({});

/** 状态中文 + 颜色 */
function statusText(status: string): string {
  const map: Record<string, string> = {
    active: t('download.statusMap.active'),
    waiting: t('download.statusMap.waiting'),
    paused: t('download.statusMap.paused'),
    complete: t('download.statusMap.complete'),
    error: t('download.statusMap.error'),
    removed: t('download.statusMap.removed'),
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'var(--el-color-success)',
    waiting: 'var(--el-color-warning)',
    paused: 'var(--nx-text-faint)',
    complete: 'var(--nx-text-faint)',
    error: 'var(--el-color-danger)',
  };
  return map[status] ?? 'var(--nx-text-faint)';
}

/** 速率格式化 */
function speedText(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '—';
  return `${formatBytes(bytesPerSec)}/s`;
}

/** ETA 格式化 */
function etaText(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/** 是否为磁力/BT 任务 */
function isTorrent(task: DownloadTask): boolean {
  return task.files.length > 1 || task.name.startsWith('magnet:');
}

/** 提交新建下载 */
async function submitAdd(): Promise<void> {
  const urls = addUrls.value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    ElMessage.warning(t('download.enterUrls'));
    return;
  }
  adding.value = true;
  const ok = await download.addTask(urls, addDir.value.trim() || undefined);
  adding.value = false;
  if (ok) {
    ElMessage.success(t('download.addedTasks', { count: urls.length }));
    addVisible.value = false;
    addUrls.value = '';
    addDir.value = '';
  } else {
    ElMessage.error(download.lastError ?? t('download.addFailed'));
  }
}

/** 暂停/恢复单个任务 */
async function toggleTask(task: DownloadTask): Promise<void> {
  if (task.status === 'active' || task.status === 'waiting') {
    await download.pauseTask(task.gid);
  } else if (task.status === 'paused') {
    await download.resumeTask(task.gid);
  }
}

/** 删除任务 */
async function removeTask(task: DownloadTask): Promise<void> {
  try {
    await ElMessageBox.confirm(
      task.status === 'complete'
        ? t('download.deleteCompleteConfirm', { name: task.name })
        : t('download.deleteActiveConfirm', { name: task.name }),
      t('download.deleteTitle'),
      { confirmButtonText: t('common.delete'), cancelButtonText: t('common.cancel'), type: 'warning' },
    );
  } catch {
    return;
  }
  const ok = await download.removeTask(task.gid);
  if (ok) ElMessage.success(t('download.taskDeleted'));
  else ElMessage.error(download.lastError ?? t('download.deleteFailed'));
}

/** 打开设置抽屉 */
async function openSettings(): Promise<void> {
  await download.fetchSettings();
  settingsForm.value = { ...download.settings };
  settingsVisible.value = true;
}

/** 保存设置 */
async function saveSettings(): Promise<void> {
  const ok = await download.updateSettings({ ...settingsForm.value });
  if (ok) {
    ElMessage.success(t('download.settingsSaved'));
    settingsVisible.value = false;
  } else {
    ElMessage.error(download.lastError ?? t('download.saveFailed'));
  }
}

/** 限速值（MB/s，双向绑定到 settings 的字节值） */
const speedLimitMB = computed({
  get: () => Math.round(Number(settingsForm.value['max-overall-download-limit'] ?? 0) / 1024 / 1024),
  set: (v: number) => {
    settingsForm.value['max-overall-download-limit'] = String(v * 1024 * 1024);
  },
});

/** 最大并发数（双向绑定到 settings 的字符串值） */
const maxConcurrent = computed({
  get: () => Number(settingsForm.value['max-concurrent-downloads'] ?? 3),
  set: (v: number) => {
    settingsForm.value['max-concurrent-downloads'] = String(v);
  },
});

/** 排序：活动 > 等待 > 暂停 > 错误 > 完成 */
const sortedTasks = computed(() => {
  const order: Record<string, number> = { active: 0, waiting: 1, paused: 2, error: 3, complete: 4, removed: 5 };
  return [...download.tasks].sort(
    (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9),
  );
});

onMounted(async () => {
  await download.fetchTasks();
  download.startPolling();
});

onUnmounted(() => {
  download.stopPolling();
});
</script>

<template>
  <div class="dv-view">
    <!-- 工具栏 -->
    <div class="dv-toolbar">
      <el-button :icon="Plus" type="primary" size="small" @click="addVisible = true">{{ t('download.newDownload') }}</el-button>
      <el-button :icon="VideoPause" size="small" @click="download.pauseAll()">{{ t('download.pauseAll') }}</el-button>
      <el-button :icon="VideoPlay" size="small" @click="download.resumeAll()">{{ t('download.resumeAll') }}</el-button>
      <div class="dv-toolbar__spacer" />
      <el-button :icon="Setting" size="small" circle @click="openSettings" />
    </div>

    <!-- 下载列表 -->
    <div v-loading="download.loading" class="dv-list">
      <div v-if="sortedTasks.length === 0 && !download.loading" class="dv-empty">
        {{ t('download.noTasks') }}
      </div>

      <div
        v-for="task in sortedTasks"
        :key="task.gid"
        class="dv-task nx-panel"
        :class="{ 'dv-task--done': task.status === 'complete', 'dv-task--error': task.status === 'error' }"
      >
        <div class="dv-task__head">
          <span class="dv-task__name" :title="task.name">{{ task.name }}</span>
          <span class="dv-task__status nx-mono" :style="{ color: statusColor(task.status) }">
            {{ statusText(task.status) }}
          </span>
        </div>

        <!-- 进度条（已完成不显示） -->
        <el-progress
          v-if="task.status !== 'complete'"
          :percentage="Math.round(task.progress)"
          :color="task.status === 'error' ? 'var(--el-color-danger)' : 'var(--nx-amber)'"
          :stroke-width="8"
          :show-text="false"
        />

        <div class="dv-task__meta nx-mono">
          <template v-if="task.status === 'active'">
            {{ task.progress.toFixed(0) }}% · {{ speedText(task.downloadSpeed) }} · ETA {{ etaText(task.eta) }}
          </template>
          <template v-else-if="task.status === 'complete'">
            {{ t('download.done', { size: formatBytes(task.totalBytes) }) }}
          </template>
          <template v-else>
            {{ formatBytes(task.completedBytes) }} / {{ formatBytes(task.totalBytes) }}
          </template>
          <span v-if="task.connections > 0">{{ t('download.connCount', { count: task.connections }) }}</span>
        </div>

        <!-- 错误信息 -->
        <el-tooltip v-if="task.error" :content="task.error" placement="top">
          <div class="dv-task__error nx-mono">{{ task.error }}</div>
        </el-tooltip>

        <!-- BT 文件列表 -->
        <div v-if="isTorrent(task) && task.files.length > 1" class="dv-task__files">
          <div v-for="f in task.files" :key="f.path" class="dv-task__file nx-mono">
            <span class="dv-task__file-name">{{ f.path.split('/').pop() }}</span>
            <span>{{ ((f.completedLength / (f.length || 1)) * 100).toFixed(0) }}%</span>
          </div>
        </div>

        <div class="dv-task__ops">
          <el-button
            v-if="task.status === 'active' || task.status === 'waiting'"
            size="small"
            :icon="VideoPause"
            @click="toggleTask(task)"
          >{{ t('common.pause') }}</el-button>
          <el-button
            v-else-if="task.status === 'paused'"
            size="small"
            :icon="VideoPlay"
            @click="toggleTask(task)"
          >{{ t('common.resume') }}</el-button>
          <el-button size="small" type="danger" plain @click="removeTask(task)">
            {{ task.status === 'complete' ? t('download.deleteRecord') : t('common.delete') }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 状态栏 -->
    <div class="dv-statusbar nx-mono">
      <span>{{ t('download.activeCount', { count: download.summary.active }) }}</span>
      <span>{{ t('download.waitingCount', { count: download.summary.waiting }) }}</span>
      <span>{{ t('download.completeCount', { count: download.summary.complete }) }}</span>
      <span class="dv-statusbar__speed">{{ t('download.totalSpeed', { speed: speedText(download.summary.totalSpeed) }) }}</span>
    </div>

    <!-- 新建下载对话框 -->
    <el-dialog v-model="addVisible" :title="t('download.addTitle')" width="520px" append-to-body>
      <el-form label-position="top">
        <el-form-item :label="t('download.urlsLabel')">
          <el-input
            v-model="addUrls"
            type="textarea"
            :rows="5"
            placeholder="https://example.com/file.iso&#10;magnet:?xt=urn:btih:…"
            class="nx-mono"
          />
        </el-form-item>
        <el-form-item :label="t('download.saveDirLabel')">
          <el-input v-model="addDir" placeholder="/data/1000/files/downloads" class="nx-mono" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="adding" @click="submitAdd">{{ t('common.add') }}</el-button>
      </template>
    </el-dialog>

    <!-- 全局设置抽屉 -->
    <el-drawer v-model="settingsVisible" :title="t('download.settingsTitle')" size="400px" append-to-body>
      <el-form label-position="top">
        <el-form-item :label="t('download.maxConcurrent')">
          <el-input-number v-model="maxConcurrent" :min="1" :max="16" />
        </el-form-item>
        <el-form-item :label="t('download.globalLimit')">
          <el-input-number v-model="speedLimitMB" :min="0" :max="1024" />
        </el-form-item>
        <el-form-item :label="t('download.defaultDir')">
          <el-input v-model="settingsForm['dir']" class="nx-mono" />
        </el-form-item>
        <el-form-item :label="t('download.btPort')">
          <el-input v-model="settingsForm['bt-listen-port']" placeholder="6881-6999" class="nx-mono" />
        </el-form-item>
        <el-form-item :label="t('download.seedRatio')">
          <el-input v-model="settingsForm['seed-ratio']" placeholder="1.0" class="nx-mono" />
        </el-form-item>
        <el-button type="primary" @click="saveSettings">{{ t('common.save') }}</el-button>
      </el-form>
    </el-drawer>
  </div>
</template>

<style scoped>
.dv-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  animation: fade-up 0.3s ease both;
}

.dv-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dv-toolbar__spacer {
  flex: 1;
}

.dv-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 180px;
}

.dv-empty {
  color: var(--nx-text-faint);
  font-size: 12px;
  text-align: center;
  padding: 32px 0;
}

.dv-task {
  padding: 12px 14px;
}

.dv-task--done {
  opacity: 0.65;
}

.dv-task--error {
  border-color: var(--el-color-danger);
}

.dv-task__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.dv-task__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--nx-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.dv-task__status {
  font-size: 11px;
  flex-shrink: 0;
}

.dv-task__meta {
  font-size: 11px;
  color: var(--nx-text-faint);
  margin-top: 6px;
}

.dv-task__error {
  font-size: 11px;
  color: var(--el-color-danger);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dv-task__files {
  margin-top: 8px;
  border-top: 1px solid var(--nx-border-faint);
  padding-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dv-task__file {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--nx-text-faint);
}

.dv-task__file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 70%;
}

.dv-task__ops {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.dv-statusbar {
  display: flex;
  align-items: center;
  gap: 18px;
  font-size: 11px;
  color: var(--nx-text-faint);
  padding: 4px 2px;
  border-top: 1px solid var(--nx-border-faint);
}

.dv-statusbar__speed {
  margin-left: auto;
  color: var(--nx-amber);
}
</style>
