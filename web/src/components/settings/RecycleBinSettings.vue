<script setup lang="ts">
/**
 * 回收站策略设置（Phase 8）
 * - 按共享文件夹配置回收站开关/保留策略/排除规则
 * - 回收站文件浏览/恢复/清空
 * - 统计信息
 */
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { recycleBinApi } from '@/api';
import type { RecycleBinConfig, RecycleBinFile, RecycleBinStats } from '@/api/types';
import { formatBytes } from '@/utils/format';

const { t, locale } = useI18n();

const config = reactive<RecycleBinConfig>({ folders: [] });
const files = ref<RecycleBinFile[]>([]);
const stats = ref<RecycleBinStats | null>(null);
const loading = ref(false);
const saving = ref(false);
const restoring = ref<string | null>(null);

onMounted(async () => {
  loading.value = true;
  try {
    const [cfg, fl, st] = await Promise.all([
      recycleBinApi.getConfig(),
      recycleBinApi.files(),
      recycleBinApi.stats(),
    ]);
    Object.assign(config, cfg);
    files.value = fl;
    stats.value = st;
  } catch { /* 服务不可用 */ } finally {
    loading.value = false;
  }
});

async function save(): Promise<void> {
  saving.value = true;
  try {
    await recycleBinApi.updateConfig({ folders: config.folders.map(f => ({ ...f })) });
    ElMessage.success(t('settings.recycleBin.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    saving.value = false;
  }
}

async function restoreFile(file: RecycleBinFile): Promise<void> {
  restoring.value = file.id;
  try {
    await recycleBinApi.restore(file.id);
    ElMessage.success(t('settings.recycleBin.restored', { name: file.fileName }));
    files.value = files.value.filter(f => f.id !== file.id);
    stats.value = await recycleBinApi.stats();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    restoring.value = null;
  }
}

async function emptyBin(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('settings.recycleBin.emptyConfirm'),
      t('settings.recycleBin.confirmTitle'),
      { type: 'warning' },
    );
  } catch { return; }
  try {
    await recycleBinApi.empty();
    ElMessage.success(t('settings.recycleBin.emptied'));
    files.value = [];
    stats.value = await recycleBinApi.stats();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

function addFolder(): void {
  config.folders.push({
    path: '/data/shared',
    enabled: true,
    retentionDays: 30,
    maxSizeMB: 1024,
    excludeExtensions: [],
    excludePaths: [],
  });
}

function removeFolder(index: number): void {
  config.folders.splice(index, 1);
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">{{ t('settings.recycleBin.title') }}</div>

    <!-- 统计 -->
    <div v-if="stats" class="rb-stats">
      <span class="nx-mono">{{ stats.totalFiles }} {{ t('common.items') }}</span>
      <span class="nx-mono">{{ formatBytes(stats.totalSize) }}</span>
      <el-button size="small" type="danger" plain :disabled="stats.totalFiles === 0" @click="emptyBin">
        {{ t('settings.recycleBin.empty') }}
      </el-button>
    </div>

    <!-- 文件夹策略 -->
    <div class="nx-panel-title" style="margin-top: 20px; font-size: 13px">{{ t('settings.recycleBin.folderPolicy') }}</div>
    <div v-for="(folder, idx) in config.folders" :key="idx" class="rb-folder-card">
      <div class="rb-folder-header">
        <el-input v-model="folder.path" class="nx-mono" size="small" style="flex: 1" />
        <el-switch v-model="folder.enabled" size="small" />
        <el-button size="small" type="danger" plain @click="removeFolder(idx)">{{ t('common.remove') }}</el-button>
      </div>
      <template v-if="folder.enabled">
        <div class="rb-folder-row">
          <span class="rb-label">{{ t('settings.recycleBin.retentionDays') }}</span>
          <el-input-number v-model="folder.retentionDays" :min="1" :max="365" size="small" />
        </div>
        <div class="rb-folder-row">
          <span class="rb-label">{{ t('settings.recycleBin.maxSize') }}</span>
          <el-input-number v-model="folder.maxSizeMB" :min="64" :max="1048576" :step="256" size="small" />
          <span class="nx-mono" style="font-size: 11px; color: var(--nx-text-dim)">MB</span>
        </div>
        <div class="rb-folder-row">
          <span class="rb-label">{{ t('settings.recycleBin.excludeExt') }}</span>
          <el-input v-model="folder.excludeExtensions" size="small" placeholder=".tmp, .log"
            @change="(v: string) => { folder.excludeExtensions = v.split(',').map(s => s.trim()).filter(Boolean) as never; }" />
        </div>
      </template>
    </div>
    <el-button size="small" style="margin-top: 8px" @click="addFolder">+ {{ t('settings.recycleBin.addFolder') }}</el-button>

    <div style="margin-top: 16px">
      <el-button type="primary" :loading="saving" @click="save">{{ t('common.saveChanges') }}</el-button>
    </div>

    <!-- 回收站文件 -->
    <div class="nx-panel-title" style="margin-top: 24px; font-size: 13px">{{ t('settings.recycleBin.files') }}</div>
    <el-table v-if="files.length > 0" :data="files" size="small" max-height="300">
      <el-table-column prop="fileName" :label="t('common.name')" min-width="160" show-overflow-tooltip />
      <el-table-column prop="originalPath" :label="t('settings.recycleBin.originalPath')" min-width="200" show-overflow-tooltip>
        <template #default="{ row }"><span class="nx-mono" style="font-size: 11px">{{ row.originalPath }}</span></template>
      </el-table-column>
      <el-table-column :label="t('settings.recycleBin.size')" width="90">
        <template #default="{ row }"><span class="nx-mono">{{ formatBytes(row.size) }}</span></template>
      </el-table-column>
      <el-table-column :label="t('settings.recycleBin.deletedAt')" width="150">
        <template #default="{ row }"><span class="nx-mono" style="font-size: 11px">{{ new Date(row.deletedAt).toLocaleString(locale) }}</span></template>
      </el-table-column>
      <el-table-column :label="t('common.action')" width="80">
        <template #default="{ row }">
          <el-button size="small" :loading="restoring === row.id" @click="restoreFile(row)">{{ t('common.restore') }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-alert v-else type="info" :closable="false" show-icon :title="t('settings.recycleBin.emptyBin')" style="margin-top: 8px" />
  </div>
</template>

<style scoped>
.rb-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid var(--nx-border-faint);
  margin-bottom: 16px;
}
.rb-folder-card {
  border: 1px solid var(--nx-border-faint);
  padding: 12px 14px;
  margin-bottom: 10px;
}
.rb-folder-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.rb-folder-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.rb-label {
  width: 120px;
  font-size: 12px;
  color: var(--nx-text-dim);
  flex-shrink: 0;
}
</style>
