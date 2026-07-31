<script setup lang="ts">
/**
 * SNMP 监控设置（Phase 7）
 * - 服务状态 + 启停控制
 * - 配置：community / 监听地址 / OID 组
 * - OID 数据实时查看
 */
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { snmpApi } from '@/api';
import type { SnmpStatus, SnmpConfig, SnmpOidData } from '@/api/types';

const { t } = useI18n();

const status = ref<SnmpStatus | null>(null);
const config = reactive<SnmpConfig>({ community: 'public', listenAddress: '0.0.0.0', enabledGroups: [] });
const oids = ref<SnmpOidData | null>(null);
const loading = ref(false);
const saving = ref(false);

const OID_GROUPS = ['system', 'cpu', 'memory', 'disk', 'network', 'temperature'];

onMounted(async () => {
  loading.value = true;
  try {
    const [s, c] = await Promise.all([snmpApi.status(), snmpApi.getConfig()]);
    status.value = s;
    Object.assign(config, c);
  } catch { /* 服务不可用 */ } finally {
    loading.value = false;
  }
});

async function toggleService(): Promise<void> {
  try {
    if (status.value?.running) {
      await snmpApi.stop();
    } else {
      await snmpApi.start();
    }
    status.value = await snmpApi.status();
    ElMessage.success(status.value.running ? t('settings.snmp.started') : t('settings.snmp.stopped'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await snmpApi.updateConfig({ ...config });
    ElMessage.success(t('settings.snmp.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    saving.value = false;
  }
}

async function fetchOids(): Promise<void> {
  try {
    oids.value = await snmpApi.oids();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">
      {{ t('settings.snmp.title') }}
      <el-tag :type="status?.running ? 'success' : 'info'" size="small" style="margin-left: 8px">
        {{ status?.running ? t('common.running') : t('common.stopped') }}
      </el-tag>
      <span v-if="status?.version" class="nx-mono" style="margin-left: 8px; font-size: 12px; color: var(--nx-text-dim)">
        v{{ status.version }}
      </span>
    </div>

    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.snmp.service')">
        <el-button :loading="loading" @click="toggleService">
          {{ status?.running ? t('common.stop') : t('common.start') }}
        </el-button>
      </el-form-item>

      <el-form-item label="Community String">
        <el-input v-model="config.community" class="nx-mono" style="max-width: 240px" />
      </el-form-item>

      <el-form-item :label="t('settings.snmp.listenAddr')">
        <el-input v-model="config.listenAddress" class="nx-mono" style="max-width: 240px" />
      </el-form-item>

      <el-form-item :label="t('settings.snmp.oidGroups')">
        <el-checkbox-group v-model="config.enabledGroups">
          <el-checkbox v-for="g in OID_GROUPS" :key="g" :label="g" :value="g" />
        </el-checkbox-group>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.saveChanges') }}</el-button>
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.snmp.oidData') }}</div>
    <el-button size="small" @click="fetchOids">{{ t('common.refresh') }}</el-button>
    <div v-if="oids" class="oid-grid">
      <div class="oid-item">
        <span class="oid-label">CPU</span>
        <span class="oid-value nx-mono">{{ oids.cpu }}%</span>
      </div>
      <div class="oid-item">
        <span class="oid-label">{{ t('settings.snmp.memory') }}</span>
        <span class="oid-value nx-mono">{{ (oids.memoryUsed / 1073741824).toFixed(1) }} / {{ (oids.memoryTotal / 1073741824).toFixed(1) }} GB</span>
      </div>
      <div class="oid-item">
        <span class="oid-label">{{ t('settings.snmp.disk') }}</span>
        <span class="oid-value nx-mono">{{ (oids.diskUsed / 1073741824).toFixed(1) }} / {{ (oids.diskTotal / 1073741824).toFixed(1) }} GB</span>
      </div>
      <div class="oid-item">
        <span class="oid-label">RX / TX</span>
        <span class="oid-value nx-mono">{{ (oids.netRx / 1048576).toFixed(1) }} / {{ (oids.netTx / 1048576).toFixed(1) }} MB</span>
      </div>
      <div v-if="oids.temperature !== null" class="oid-item">
        <span class="oid-label">{{ t('settings.snmp.temp') }}</span>
        <span class="oid-value nx-mono">{{ oids.temperature }}°C</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oid-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.oid-item {
  padding: 10px 14px;
  border: 1px solid var(--nx-border-faint);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.oid-label {
  font-size: 12px;
  color: var(--nx-text-dim);
}
.oid-value {
  font-size: 15px;
  font-weight: 600;
}
</style>
