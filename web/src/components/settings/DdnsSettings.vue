<script setup lang="ts">
/**
 * DDNS 动态域名配置（Phase 2）
 * 嵌入设置中心 > 网络分区
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { ddnsApi } from '@/api';
import type { DdnsConfig, DdnsStatus, DdnsHistoryEntry } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const status = ref<DdnsStatus | null>(null);
const config = ref<DdnsConfig | null>(null);
const history = ref<DdnsHistoryEntry[]>([]);

onMounted(async () => {
  loading.value = true;
  try {
    status.value = await ddnsApi.getStatus();
    history.value = await ddnsApi.getHistory();
    config.value = {
      enabled: status.value?.enabled ?? false,
      provider: 'cloudflare',
      domain: '', recordName: '@',
      apiKey: '', apiSecret: '', customUrl: '',
      intervalMinutes: 30,
    };
  } catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
});

async function save(): Promise<void> {
  if (!config.value) return;
  try {
    await ddnsApi.updateConfig(config.value);
    status.value = await ddnsApi.getStatus();
    ElMessage.success(t('common.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function manualUpdate(): Promise<void> {
  try {
    const res = await ddnsApi.update();
    ElMessage.success(t('settings.ddns.updated', { ip: res.ip }));
    status.value = await ddnsApi.getStatus();
    history.value = await ddnsApi.getHistory();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="ddns-settings">
    <div class="nx-panel-title">{{ t('settings.ddns.title') }}</div>

    <!-- 状态 -->
    <div v-if="status" class="ddns-status">
      <div class="ddns-status-item">
        <span class="ddns-label">{{ t('common.status') }}</span>
        <span :class="status.enabled ? 'dot dot--green' : 'dot dot--gray'" />
        <span>{{ status.enabled ? t('common.enabled') : t('common.disabled') }}</span>
      </div>
      <div class="ddns-status-item">
        <span class="ddns-label">{{ t('settings.ddns.network') }}</span>
        <span :class="status.online ? 'dot dot--green' : 'dot dot--red'" />
        <span>{{ status.online ? t('settings.ddns.online') : t('settings.ddns.offline') }}</span>
      </div>
      <div class="ddns-status-item">
        <span class="ddns-label">{{ t('settings.ddns.currentIp') }}</span>
        <span class="nx-mono">{{ status.currentIp ?? '—' }}</span>
      </div>
      <div class="ddns-status-item">
        <span class="ddns-label">{{ t('settings.ddns.lastUpdate') }}</span>
        <span class="nx-mono">{{ status.lastUpdate ?? '—' }}</span>
      </div>
    </div>

    <!-- 配置 -->
    <template v-if="config">
      <el-form label-position="top" class="settings-form" style="margin-top: 16px">
        <el-form-item :label="t('common.enabled')">
          <el-switch v-model="config.enabled" />
        </el-form-item>
        <template v-if="config.enabled">
          <el-form-item :label="t('settings.ddns.provider')">
            <el-select v-model="config.provider">
              <el-option label="Cloudflare" value="cloudflare" />
              <el-option :label="t('settings.ddns.aliyun')" value="aliyun" />
              <el-option :label="t('settings.ddns.custom')" value="custom" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('settings.ddns.domain')">
            <el-input v-model="config.domain" placeholder="example.com" />
          </el-form-item>
          <el-form-item :label="t('settings.ddns.recordName')">
            <el-input v-model="config.recordName" placeholder="@ 或 nas" />
          </el-form-item>
          <el-form-item v-if="config.provider !== 'custom'" :label="t('settings.ddns.apiKey')">
            <el-input v-model="config.apiKey" type="password" show-password />
          </el-form-item>
          <el-form-item v-if="config.provider === 'aliyun'" :label="t('settings.ddns.apiSecret')">
            <el-input v-model="config.apiSecret" type="password" show-password />
          </el-form-item>
          <el-form-item v-if="config.provider === 'custom'" :label="t('settings.ddns.customUrl')">
            <el-input v-model="config.customUrl" placeholder="https://ddns.example.com/update?ip={ip}" />
          </el-form-item>
          <el-form-item :label="t('settings.ddns.interval')">
            <el-input-number v-model="config.intervalMinutes" :min="1" :max="1440" />
            <span class="ddns-unit">{{ t('settings.ddns.minutes') }}</span>
          </el-form-item>
        </template>
        <el-form-item>
          <el-button type="primary" @click="save">{{ t('common.saveChanges') }}</el-button>
          <el-button v-if="config.enabled" @click="manualUpdate">{{ t('settings.ddns.updateNow') }}</el-button>
        </el-form-item>
      </el-form>
    </template>

    <!-- 离线提示 -->
    <el-alert
      v-if="status && !status.online"
      type="info"
      :closable="false"
      show-icon
      :title="t('settings.ddns.offlineTip')"
      style="margin-top: 12px"
    />

    <!-- 更新历史 -->
    <div v-if="history.length" class="nx-panel-title" style="margin-top: 20px">{{ t('settings.ddns.history') }}</div>
    <el-table v-if="history.length" :data="history" size="small" stripe max-height="240">
      <el-table-column prop="timestamp" :label="t('common.time')" width="160" />
      <el-table-column prop="ip" label="IP" width="130" />
      <el-table-column :label="t('common.result')" width="80">
        <template #default="{ row }">
          <span :style="{ color: row.success ? 'var(--nx-green)' : 'var(--nx-red)' }">
            {{ row.success ? '✓' : '✗' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="message" :label="t('settings.ddns.colMessage')" />
    </el-table>
  </div>
</template>

<style scoped>
.ddns-status { display: flex; flex-wrap: wrap; gap: 16px; padding: 8px 0; }
.ddns-status-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.ddns-label { color: var(--nx-text-dim); min-width: 60px; }
.ddns-unit { margin-left: 8px; color: var(--nx-text-dim); font-size: 12px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot--green { background: var(--nx-green); }
.dot--gray { background: var(--nx-text-faint); }
.dot--red { background: var(--nx-red); }
</style>
