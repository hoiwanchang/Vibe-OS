<script setup lang="ts">
/**
 * FTP/SFTP 服务配置（Phase 2）
 * 嵌入设置中心 > 服务分区
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { ftpApi } from '@/api';
import type { FtpStatus, FtpLogEntry } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const status = ref<FtpStatus | null>(null);
const logs = ref<FtpLogEntry[]>([]);
const showLogs = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    status.value = await ftpApi.getStatus();
  } catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
});

async function toggleFtp(): Promise<void> {
  if (!status.value) return;
  try {
    if (status.value.ftp.running) {
      await ftpApi.stop();
      ElMessage.success(t('settings.ftp.stopped'));
    } else {
      await ftpApi.start();
      ElMessage.success(t('settings.ftp.started'));
    }
    status.value = await ftpApi.getStatus();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function saveConfig(): Promise<void> {
  if (!status.value) return;
  try {
    await ftpApi.updateConfig(status.value.config);
    ElMessage.success(t('common.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function loadLogs(): Promise<void> {
  try {
    const res = await ftpApi.getLogs({ page: 1, size: 50 });
    logs.value = res.logs;
    showLogs.value = true;
  } catch { /* ignore */ }
}
</script>

<template>
  <div class="ftp-settings">
    <div class="nx-panel-title">{{ t('settings.ftp.title') }}</div>

    <!-- FTP 状态 -->
    <div class="ftp-status-row">
      <div class="ftp-status-item">
        <span class="ftp-label">FTP</span>
        <span :class="status?.ftp.running ? 'dot dot--green' : 'dot dot--gray'" />
        <span class="nx-mono">{{ status?.ftp.running ? t('common.running') : t('common.stopped') }}</span>
      </div>
      <div class="ftp-status-item">
        <span class="ftp-label">SFTP</span>
        <span :class="status?.sftp.running ? 'dot dot--green' : 'dot dot--gray'" />
        <span class="nx-mono">{{ status?.sftp.running ? t('common.running') : t('common.stopped') }}</span>
      </div>
      <el-button size="small" @click="toggleFtp">
        {{ status?.ftp.running ? t('common.stop') : t('common.start') }} FTP
      </el-button>
      <el-button size="small" text @click="loadLogs">{{ t('settings.ftp.viewLogs') }}</el-button>
    </div>

    <!-- FTP 配置 -->
    <template v-if="status">
      <el-form label-position="top" class="settings-form" style="margin-top: 16px">
        <el-form-item :label="t('settings.ftp.port')">
          <el-input-number v-model="status.config.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item :label="t('settings.ftp.passiveRange')">
          <div class="ftp-range">
            <el-input-number v-model="status.config.passivePortMin" :min="1024" :max="65535" />
            <span>—</span>
            <el-input-number v-model="status.config.passivePortMax" :min="1024" :max="65535" />
          </div>
        </el-form-item>
        <el-form-item :label="t('settings.ftp.maxClients')">
          <el-input-number v-model="status.config.maxClients" :min="1" :max="1000" />
        </el-form-item>
        <el-form-item :label="t('settings.ftp.anonymous')">
          <el-switch v-model="status.config.anonymousEnabled" />
        </el-form-item>
        <el-form-item :label="t('settings.ftp.tls')">
          <el-switch v-model="status.config.tlsEnabled" />
        </el-form-item>
        <el-form-item :label="t('settings.ftp.banner')">
          <el-input v-model="status.config.banner" placeholder="Vibe OS FTP" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveConfig">{{ t('common.saveChanges') }}</el-button>
        </el-form-item>
      </el-form>
    </template>

    <!-- 日志对话框 -->
    <el-dialog v-model="showLogs" :title="t('settings.ftp.logs')" width="700px">
      <el-table :data="logs" size="small" max-height="400">
        <el-table-column prop="timestamp" :label="t('common.time')" width="160" />
        <el-table-column prop="user" :label="t('settings.ftp.colUser')" width="100" />
        <el-table-column prop="ip" label="IP" width="130" />
        <el-table-column prop="action" :label="t('settings.ftp.colAction')" width="100" />
        <el-table-column prop="path" :label="t('settings.ftp.colPath')" />
        <el-table-column :label="t('common.result')" width="80">
          <template #default="{ row }">
            <span :style="{ color: row.result === 'success' ? 'var(--nx-green)' : 'var(--nx-red)' }">
              {{ row.result }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.ftp-status-row { display: flex; align-items: center; gap: 16px; padding: 8px 0; }
.ftp-status-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.ftp-label { font-weight: 600; min-width: 36px; }
.ftp-range { display: flex; align-items: center; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot--green { background: var(--nx-green); }
.dot--gray { background: var(--nx-text-faint); }
</style>
