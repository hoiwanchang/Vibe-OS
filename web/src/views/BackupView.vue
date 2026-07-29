<script setup lang="ts">
/**
 * 备份与快照窗口（P1）
 * - 标签 1：备份任务（卡片列表 + 执行历史 el-timeline）
 * - 标签 2：快照（表格 + 创建/删除）
 * - 新建任务：名称 / 源路径 / 目标路径 / 类型 / cron + 人类可读预览
 * - 执行中任务显示进度；恢复选择历史执行
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, VideoPlay } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { useBackupStore } from '@/stores/backup';
import type { BackupJob, CreateBackupJobRequest } from '@/api/types';
import { formatBytes, formatTime } from '@/utils/format';

const backup = useBackupStore();
const { t } = useI18n();

/** 当前标签 */
const activeTab = ref('jobs');

/** 新建任务对话框 */
const createVisible = ref(false);
const submitting = ref(false);
const form = reactive<CreateBackupJobRequest>({
  name: '',
  source: '',
  target: '',
  type: 'rsync',
  schedule: '',
});

/** 当前查看历史的任务 */
const historyJob = ref<BackupJob | null>(null);

/** 快照创建对话框 */
const snapVisible = ref(false);
const snapPool = ref('');
const snapName = ref('');

/** cron 人类可读预览 */
const cronPreview = computed(() => describeCron(form.schedule ?? ''));

/** 简易 cron 表达式人类可读描述 */
function describeCron(expr: string): string {
  if (!expr.trim()) return t('backup.cron.manual');
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return t('backup.cron.badFormat');
  const [min, hour, dom, , dow] = parts as [string, string, string, string, string];
  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  if (dom === '*' && dow === '*') return t('backup.cron.daily', { time });
  if (dom === '*' && dow === '0') return t('backup.cron.sunday', { time });
  if (dom === '*' && dow === '1') return t('backup.cron.monday', { time });
  if (dom === '1' && dow === '*') return t('backup.cron.monthly', { time });
  return t('backup.cron.custom', { expr });
}

/** 任务类型中文 */
function typeText(type: string): string {
  const map: Record<string, string> = {
    rsync: t('backup.typeRsync'),
    snapshot: t('backup.typeSnapshot'),
    archive: t('backup.typeArchive'),
  };
  return map[type] ?? type;
}

/** 上次状态标签 */
function statusTag(status: string | null): 'success' | 'danger' | 'warning' | 'info' {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'running') return 'warning';
  return 'info';
}

function statusText(status: string | null): string {
  if (!status) return t('backup.neverRun');
  const map: Record<string, string> = {
    success: t('backup.statusMap.success'),
    failed: t('backup.statusMap.failed'),
    running: t('backup.statusMap.running'),
  };
  return map[status] ?? status;
}

/** 执行历史 timeline 节点类型 */
function execType(status: string): 'success' | 'danger' | 'primary' {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  return 'primary';
}

/** 打开历史面板 */
async function showHistory(job: BackupJob): Promise<void> {
  historyJob.value = job;
  await backup.fetchHistory(job.id);
}

/** 提交新建任务 */
async function submitCreate(): Promise<void> {
  if (!form.name.trim() || !form.source.trim() || !form.target.trim()) {
    ElMessage.warning(t('backup.fillRequired'));
    return;
  }
  submitting.value = true;
  const payload: CreateBackupJobRequest = {
    name: form.name.trim(),
    source: form.source.trim(),
    target: form.target.trim(),
    type: form.type,
  };
  if (form.schedule?.trim()) payload.schedule = form.schedule.trim();
  const ok = await backup.createJob(payload);
  submitting.value = false;
  if (ok) {
    ElMessage.success(t('backup.jobCreated'));
    createVisible.value = false;
    Object.assign(form, { name: '', source: '', target: '', type: 'rsync', schedule: '' });
  } else {
    ElMessage.error(backup.lastError ?? t('backup.createFailed'));
  }
}

/** 立即执行 */
async function runJob(job: BackupJob): Promise<void> {
  const ok = await backup.runJob(job.id);
  if (ok) ElMessage.success(t('backup.jobStarted', { name: job.name }));
  else ElMessage.error(backup.lastError ?? t('backup.startFailed'));
}

/** 删除任务 */
async function deleteJob(job: BackupJob): Promise<void> {
  try {
    await ElMessageBox.confirm(t('backup.deleteJobConfirm', { name: job.name }), t('backup.deleteTitle'), {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    });
  } catch {
    return;
  }
  const ok = await backup.deleteJob(job.id);
  if (ok) ElMessage.success(t('backup.jobDeleted'));
  else ElMessage.error(backup.lastError ?? t('backup.deleteFailed'));
}

/** 恢复备份 */
async function restore(job: BackupJob, executionId: string): Promise<void> {
  try {
    await ElMessageBox.confirm(t('backup.restoreConfirm'), t('backup.restoreTitle'), {
      confirmButtonText: t('common.restore'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    });
  } catch {
    return;
  }
  const ok = await backup.restore(job.id, executionId);
  if (ok) ElMessage.success(t('backup.restoreIssued'));
  else ElMessage.error(backup.lastError ?? t('backup.restoreFailed'));
}

/** 提交创建快照 */
async function submitSnapshot(): Promise<void> {
  if (!snapPool.value || !snapName.value.trim()) {
    ElMessage.warning(t('backup.selectPoolAndName'));
    return;
  }
  const ok = await backup.createSnapshot(snapPool.value, snapName.value.trim());
  if (ok) {
    ElMessage.success(t('backup.snapshotCreated'));
    snapVisible.value = false;
    snapName.value = '';
  } else {
    ElMessage.error(backup.lastError ?? t('backup.createFailed'));
  }
}

/** 删除快照 */
async function deleteSnapshot(name: string): Promise<void> {
  try {
    await ElMessageBox.confirm(t('backup.deleteSnapConfirm', { name }), t('backup.deleteSnapTitle'), {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    });
  } catch {
    return;
  }
  const ok = await backup.deleteSnapshot(name);
  if (ok) ElMessage.success(t('backup.snapshotDeleted'));
  else ElMessage.error(backup.lastError ?? t('backup.deleteFailed'));
}

/** 存储池名称列表（供快照选择） */
const poolNames = ['data-pool', 'backup-pool'];

onMounted(() => {
  void backup.fetchJobs();
  void backup.fetchSnapshots();
});
</script>

<template>
  <div class="bv-view">
    <el-tabs v-model="activeTab">
      <!-- 标签 1：备份任务 -->
      <el-tab-pane :label="t('backup.tabJobs')" name="jobs">
        <div class="bv-jobs">
          <div v-if="backup.jobs.length === 0 && !backup.loading" class="bv-empty">
            {{ t('backup.noJobs') }}
          </div>
          <div v-for="job in backup.jobs" :key="job.id" class="bv-job nx-panel">
            <div class="bv-job__head">
              <span class="bv-job__name">{{ job.name }}</span>
              <el-tag :type="statusTag(job.lastStatus)" size="small">{{ statusText(job.lastStatus) }}</el-tag>
              <span class="bv-job__type nx-mono">{{ typeText(job.type) }}</span>
            </div>
            <div class="bv-job__paths nx-mono">
              {{ job.source }} → {{ job.target }}
            </div>
            <div class="bv-job__meta">
              <span class="nx-mono">{{ job.schedule ?? t('common.manual') }}</span>
              <span v-if="job.lastRun">{{ t('common.lastRun') }}：{{ formatTime(job.lastRun) }}</span>
            </div>
            <div class="bv-job__ops">
              <el-button size="small" :icon="VideoPlay" @click="runJob(job)">{{ t('common.run') }}</el-button>
              <el-button size="small" @click="showHistory(job)">{{ t('common.history') }}</el-button>
              <el-button size="small" type="danger" plain @click="deleteJob(job)">{{ t('common.delete') }}</el-button>
            </div>
          </div>

          <div class="bv-create">
            <el-button :icon="Plus" type="primary" @click="createVisible = true">{{ t('backup.newJob') }}</el-button>
          </div>
        </div>

        <!-- 执行历史 -->
        <div v-if="historyJob" class="nx-panel bv-history">
          <div class="bv-section-title">{{ t('backup.execHistory', { name: historyJob.name }) }}</div>
          <div v-if="(backup.executions[historyJob.id] ?? []).length === 0" class="bv-empty">
            {{ t('backup.noExec') }}
          </div>
          <el-timeline v-else>
            <el-timeline-item
              v-for="exec in backup.executions[historyJob.id] ?? []"
              :key="exec.id"
              :type="execType(exec.status)"
              :timestamp="formatTime(exec.startedAt)"
              placement="top"
            >
              <div class="bv-exec">
                <span class="bv-exec__status">{{ statusText(exec.status) }}</span>
                <span class="nx-mono bv-exec__meta">
                  {{ t('backup.execFiles', { bytes: formatBytes(exec.bytesTransferred), files: exec.filesTransferred }) }}
                </span>
                <el-button
                  v-if="exec.status === 'success'"
                  size="small"
                  text
                  type="primary"
                  @click="restore(historyJob, exec.id)"
                >{{ t('common.restore') }}</el-button>
              </div>
              <div v-if="exec.error" class="bv-exec__error nx-mono">{{ exec.error }}</div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </el-tab-pane>

      <!-- 标签 2：快照 -->
      <el-tab-pane :label="t('backup.tabSnapshots')" name="snapshots">
        <div class="nx-panel">
          <el-table v-loading="backup.loading" :data="backup.snapshots" size="small" stripe>
            <el-table-column prop="name" :label="t('common.name')" min-width="140">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="pool" :label="t('common.pool')" min-width="120">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.pool }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.createdAt')" min-width="140">
              <template #default="{ row }">
                <span class="nx-mono">{{ formatTime(row.createdAt) }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.bytes')" width="100">
              <template #default="{ row }">
                <span class="nx-mono">{{ formatBytes(row.usedBytes) }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.ops')" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text type="danger" @click="deleteSnapshot(row.name)">{{ t('common.delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="bv-create">
            <el-button :icon="Plus" type="primary" @click="snapVisible = true">{{ t('backup.createSnapshot') }}</el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新建任务对话框 -->
    <el-dialog v-model="createVisible" :title="t('backup.createJob')" width="520px" append-to-body>
      <el-form label-position="top">
        <el-form-item :label="t('backup.jobName')">
          <el-input v-model="form.name" :placeholder="t('backup.jobNamePh')" />
        </el-form-item>
        <el-form-item :label="t('backup.sourcePath')">
          <el-input v-model="form.source" placeholder="/data/1000/files/docs" class="nx-mono" />
        </el-form-item>
        <el-form-item :label="t('backup.targetPath')">
          <el-input v-model="form.target" placeholder="/data/backup/docs" class="nx-mono" />
        </el-form-item>
        <el-form-item :label="t('backup.backupType')">
          <el-radio-group v-model="form.type">
            <el-radio value="rsync">{{ t('backup.typeRsync') }}</el-radio>
            <el-radio value="snapshot">{{ t('backup.typeSnapshot') }}</el-radio>
            <el-radio value="archive">{{ t('backup.typeArchive') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('backup.cronLabel')">
          <el-input v-model="form.schedule" placeholder="0 3 * * *" class="nx-mono" />
          <div class="bv-cron-preview">{{ cronPreview }}</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">{{ t('common.create') }}</el-button>
      </template>
    </el-dialog>

    <!-- 创建快照对话框 -->
    <el-dialog v-model="snapVisible" :title="t('backup.createSnapshot')" width="420px" append-to-body>
      <el-form label-position="top">
        <el-form-item :label="t('common.pool')">
          <el-select v-model="snapPool" :placeholder="t('backup.selectPool')" style="width: 100%">
            <el-option v-for="p in poolNames" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('backup.snapshotName')">
          <el-input v-model="snapName" :placeholder="t('backup.snapshotNamePh')" class="nx-mono" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="snapVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitSnapshot">{{ t('common.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bv-view {
  animation: fade-up 0.3s ease both;
}

.bv-section-title {
  font-family: var(--nx-font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--nx-amber);
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--nx-border-faint);
}

.bv-empty {
  color: var(--nx-text-faint);
  font-size: 12px;
  padding: 16px 0;
  text-align: center;
}

.bv-jobs {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bv-job {
  padding: 12px 14px;
}

.bv-job__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.bv-job__name {
  font-family: var(--nx-font-display);
  font-size: 14px;
  font-weight: 700;
  color: var(--nx-text);
}

.bv-job__type {
  margin-left: auto;
  font-size: 11px;
  color: var(--nx-text-faint);
}

.bv-job__paths {
  font-size: 11px;
  color: var(--nx-amber);
  margin-bottom: 6px;
  word-break: break-all;
}

.bv-job__meta {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: var(--nx-text-faint);
  margin-bottom: 10px;
}

.bv-job__ops {
  display: flex;
  gap: 8px;
}

.bv-create {
  margin-top: 14px;
}

.bv-history {
  margin-top: 16px;
}

.bv-exec {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.bv-exec__status {
  font-weight: 600;
  font-size: 13px;
  color: var(--nx-text);
}

.bv-exec__meta {
  font-size: 11px;
  color: var(--nx-text-faint);
}

.bv-exec__error {
  font-size: 11px;
  color: var(--el-color-danger);
  margin-top: 4px;
}

.bv-cron-preview {
  font-size: 11px;
  color: var(--nx-amber);
  margin-top: 4px;
}
</style>
