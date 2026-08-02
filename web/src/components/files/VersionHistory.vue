<script setup lang="ts">
/**
 * 文件版本历史抽屉（Phase 1）
 * 列出指定文件的版本，支持下载 / 恢复 / 删除单个版本
 */
import { ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { Download, RefreshLeft, Delete } from '@element-plus/icons-vue';
import { filesApi } from '@/api';
import type { VersionEntry } from '@/api/types';
import { useFilesStore } from '@/stores/files';
import { formatBytes, formatTime } from '@/utils/format';

const { t } = useI18n();
const files = useFilesStore();

const props = defineProps<{
  /** 抽屉可见性（v-model） */
  modelValue: boolean;
  /** 目标文件相对路径 */
  path: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'restored'): void;
}>();

const visible = ref(props.modelValue);
watch(
  () => props.modelValue,
  (v) => {
    visible.value = v;
    if (v && props.path) void load();
  },
);
watch(visible, (v) => emit('update:modelValue', v));

const versions = ref<VersionEntry[]>([]);
const loading = ref(false);

/** 拉取版本列表 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await filesApi.versions(files.uid, props.path);
    versions.value = res.versions;
  } catch (err) {
    versions.value = [];
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    loading.value = false;
  }
}

/** 下载指定版本 */
function downloadVersion(version: number): void {
  const a = document.createElement('a');
  a.href = filesApi.versionDownloadUrl(files.uid, props.path, version);
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 恢复指定版本 */
async function restore(version: number): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('files.versionRestoreConfirm', { version }),
      t('files.versionRestore'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await filesApi.restoreVersion(files.uid, props.path, version);
    ElMessage.success(t('files.versionRestored', { version }));
    emit('restored');
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

/** 删除指定版本 */
async function remove(version: number): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('files.versionDeleteConfirm', { version }),
      t('files.versionDelete'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'error' },
    );
  } catch {
    return;
  }
  try {
    await filesApi.deleteVersion(files.uid, props.path, version);
    ElMessage.success(t('files.versionDeleted', { version }));
    await load();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <el-drawer v-model="visible" :title="t('files.versions')" size="460px" append-to-body>
    <div v-loading="loading" class="vh">
      <div class="vh__path nx-mono">{{ path }}</div>
      <div v-if="!loading && versions.length === 0" class="vh__empty">
        {{ t('files.versionEmpty') }}
      </div>
      <div v-else class="vh__list">
        <div v-for="v in versions" :key="v.version" class="vh__item">
          <div class="vh__badge nx-mono">v{{ v.version }}</div>
          <div class="vh__info">
            <div class="vh__meta nx-mono">
              {{ formatBytes(v.size) }} · {{ formatTime(v.createdAt) }}
            </div>
          </div>
          <el-button :icon="Download" size="small" text @click="downloadVersion(v.version)" />
          <el-button :icon="RefreshLeft" size="small" text type="primary" @click="restore(v.version)" />
          <el-button :icon="Delete" size="small" text type="danger" @click="remove(v.version)" />
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.vh {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}
.vh__path {
  padding: 8px 10px;
  background: var(--nx-bg-elevated, #161616);
  border: 1px solid var(--nx-border, #2a2a2a);
  color: var(--nx-text-dim, #888);
  font-size: 12px;
  word-break: break-all;
}
.vh__empty {
  padding: 40px 0;
  text-align: center;
  color: var(--nx-text-dim, #666);
}
.vh__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.vh__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--nx-border, #2a2a2a);
  background: var(--nx-bg-elevated, #141414);
}
.vh__badge {
  min-width: 40px;
  text-align: center;
  padding: 2px 6px;
  background: var(--nx-accent, #f5a623);
  color: #000;
  font-weight: 700;
  font-size: 12px;
}
.vh__info {
  flex: 1;
  min-width: 0;
}
.vh__meta {
  font-size: 12px;
  color: var(--nx-text-dim, #999);
}
</style>
