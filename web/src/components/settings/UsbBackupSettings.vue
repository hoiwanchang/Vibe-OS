<script setup lang="ts">
/**
 * USB 外设备份设置（Phase 8）
 * - 设备检测 + 一键备份
 * - 备份策略：复制 / rsync 增量 / 双向同步
 * - 备份状态 + 历史
 */
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { usbBackupApi } from '@/api';
import type { UsbDevice, UsbBackupConfig, UsbBackupStatus, UsbBackupHistoryEntry } from '@/api/types';
import { formatBytes } from '@/utils/format';

const { t, locale } = useI18n();

const devices = ref<UsbDevice[]>([]);
const config = reactive<UsbBackupConfig>({
  enabled: false,
  mode: 'rsync',
  sourcePath: '/data',
  autoOnInsert: false,
  excludePatterns: [],
});
const status = ref<UsbBackupStatus | null>(null);
const history = ref<UsbBackupHistoryEntry[]>([]);
const loading = ref(false);
const saving = ref(false);
const executing = ref(false);
const excludeInput = ref('');

onMounted(async () => {
  loading.value = true;
  try {
    const [devs, cfg, st, hist] = await Promise.all([
      usbBackupApi.devices(),
      usbBackupApi.getConfig(),
      usbBackupApi.status(),
      usbBackupApi.history(),
    ]);
    devices.value = devs;
    Object.assign(config, cfg);
    status.value = st;
    history.value = hist;
  } catch { /* 服务不可用 */ } finally {
    loading.value = false;
  }
});

async function save(): Promise<void> {
  saving.value = true;
  try {
    await usbBackupApi.updateConfig({ ...config });
    ElMessage.success(t('settings.usbBackup.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    saving.value = false;
  }
}

async function executeBackup(device: UsbDevice): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('settings.usbBackup.executeConfirm', { device: device.name }),
      t('settings.usbBackup.confirmTitle'),
      { type: 'warning' },
    );
  } catch { return; }
  executing.value = true;
  try {
    await usbBackupApi.execute(device.name);
    ElMessage.success(t('settings.usbBackup.started'));
    // 刷新状态
    status.value = await usbBackupApi.status();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    executing.value = false;
  }
}

async function refresh(): Promise<void> {
  try {
    const [devs, st, hist] = await Promise.all([
      usbBackupApi.devices(),
      usbBackupApi.status(),
      usbBackupApi.history(),
    ]);
    devices.value = devs;
    status.value = st;
    history.value = hist;
  } catch { /* ignore */ }
}

function addExclude(): void {
  const v = excludeInput.value.trim();
  if (v && !config.excludePatterns.includes(v)) {
    config.excludePatterns.push(v);
  }
  excludeInput.value = '';
}

function removeExclude(pattern: string): void {
  config.excludePatterns = config.excludePatterns.filter(p => p !== pattern);
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">{{ t('settings.usbBackup.title') }}</div>

    <!-- 备份状态 -->
    <div v-if="status" class="usb-status-card">
      <div class="usb-status-row">
        <span class="usb-label">{{ t('common.status') }}</span>
        <el-tag :type="status.running ? 'warning' : status.lastResult === 'success' ? 'success' : status.lastResult === 'failed' ? 'danger' : 'info'" size="small">
          {{ status.running ? t('common.running') : status.lastResult === 'success' ? t('common.success') : status.lastResult === 'failed' ? t('common.failed') : t('common.never') }}
        </el-tag>
      </div>
      <div v-if="status.running" class="usb-status-row">
        <span class="usb-label">{{ t('settings.usbBackup.progress') }}</span>
        <el-progress :percentage="status.progress" :stroke-width="14" style="flex: 1" />
      </div>
      <div v-if="status.currentFile" class="usb-status-row">
        <span class="usb-label">{{ t('settings.usbBackup.currentFile') }}</span>
        <span class="nx-mono" style="font-size: 11px; overflow: hidden; text-overflow: ellipsis">{{ status.currentFile }}</span>
      </div>
      <div v-if="status.lastRun" class="usb-status-row">
        <span class="usb-label">{{ t('settings.usbBackup.lastRun') }}</span>
        <span class="nx-mono" style="font-size: 12px">{{ new Date(status.lastRun).toLocaleString(locale) }}</span>
      </div>
    </div>

    <!-- USB 设备列表 -->
    <div class="nx-panel-title" style="margin-top: 20px; font-size: 13px">{{ t('settings.usbBackup.devices') }}</div>
    <el-table v-if="devices.length > 0" :data="devices" size="small" class="nx-mono">
      <el-table-column prop="name" label="Device" width="100" />
      <el-table-column prop="size" label="Size" width="80" />
      <el-table-column prop="model" label="Model" />
      <el-table-column prop="fstype" label="FS" width="70" />
      <el-table-column prop="mountpoint" label="Mount" width="120">
        <template #default="{ row }">{{ row.mountpoint ?? '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('common.action')" width="90">
        <template #default="{ row }">
          <el-button size="small" :loading="executing" :disabled="!row.mountpoint" @click="executeBackup(row)">
            {{ t('settings.usbBackup.backup') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-alert v-else type="info" :closable="false" show-icon :title="t('settings.usbBackup.noDevices')" style="margin: 8px 0" />
    <el-button size="small" style="margin-top: 8px" @click="refresh">{{ t('common.refresh') }}</el-button>

    <!-- 备份策略 -->
    <div class="nx-panel-title" style="margin-top: 20px; font-size: 13px">{{ t('settings.usbBackup.strategy') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('common.enabled')">
        <el-switch v-model="config.enabled" />
      </el-form-item>
      <template v-if="config.enabled">
        <el-form-item :label="t('settings.usbBackup.mode')">
          <el-radio-group v-model="config.mode">
            <el-radio value="copy">{{ t('settings.usbBackup.modeCopy') }}</el-radio>
            <el-radio value="rsync">{{ t('settings.usbBackup.modeRsync') }}</el-radio>
            <el-radio value="bidirectional">{{ t('settings.usbBackup.modeBidi') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('settings.usbBackup.sourcePath')">
          <el-input v-model="config.sourcePath" class="nx-mono" />
        </el-form-item>
        <el-form-item :label="t('settings.usbBackup.autoOnInsert')">
          <el-switch v-model="config.autoOnInsert" />
        </el-form-item>
        <el-form-item :label="t('settings.usbBackup.exclude')">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-input v-model="excludeInput" placeholder="*.tmp, .cache" @keyup.enter="addExclude" />
            <el-button @click="addExclude">{{ t('common.add') }}</el-button>
          </div>
          <div v-if="config.excludePatterns.length > 0" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px">
            <el-tag v-for="p in config.excludePatterns" :key="p" closable @close="removeExclude(p)">{{ p }}</el-tag>
          </div>
        </el-form-item>
      </template>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.saveChanges') }}</el-button>
      </el-form-item>
    </el-form>

    <!-- 备份历史 -->
    <div v-if="history.length > 0">
      <div class="nx-panel-title" style="margin-top: 16px; font-size: 13px">{{ t('settings.usbBackup.history') }}</div>
      <div class="usb-history-list">
        <div v-for="(h, i) in history" :key="i" class="usb-history-item">
          <el-tag :type="h.success ? 'success' : 'danger'" size="small" style="flex-shrink: 0">
            {{ h.success ? t('common.success') : t('common.failed') }}
          </el-tag>
          <span class="nx-mono" style="font-size: 12px">{{ h.mode }}</span>
          <span class="nx-mono" style="font-size: 12px">{{ h.filesTransferred }} files / {{ formatBytes(h.bytesTransferred) }}</span>
          <span class="nx-mono" style="margin-left: auto; font-size: 11px; color: var(--nx-text-dim)">
            {{ new Date(h.startedAt).toLocaleString(locale) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.usb-status-card {
  padding: 14px 16px;
  border: 1px solid var(--nx-border-faint);
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.usb-status-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.usb-label {
  width: 80px;
  font-size: 12px;
  color: var(--nx-text-dim);
  flex-shrink: 0;
}
.usb-history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.usb-history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--nx-border-faint);
  font-size: 13px;
}
</style>
