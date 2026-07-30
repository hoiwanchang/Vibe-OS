<script setup lang="ts">
/**
 * 网络设置：接口概览 + DNS + 代理
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { systemApi } from '@/api';
import type { NetworkDriversResponse } from '@/api/types';
import ProxySettings from '@/components/settings/ProxySettings.vue';
import DdnsSettings from '@/components/settings/DdnsSettings.vue';

const { t } = useI18n();
const netData = ref<NetworkDriversResponse | null>(null);
const dns1 = ref('223.5.5.5');
const dns2 = ref('8.8.8.8');
const proxyEnabled = ref(false);
const proxyHost = ref('');
const proxyPort = ref(7890);

onMounted(async () => {
  try {
    netData.value = await systemApi.networkDrivers();
  } catch { /* 演示模式降级 */ }
});

function save(): void {
  ElMessage.success(t('settings.network.saved'));
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">{{ t('settings.network.interfaces') }}</div>
    <div v-if="netData" class="net-interfaces">
      <div v-for="iface in netData.interfaces" :key="iface.name" class="net-iface-card">
        <div class="net-iface-head">
          <span class="nx-mono">{{ iface.name }}</span>
          <span :class="iface.linkDetected ? 'dot dot--green' : 'dot dot--gray'" />
          <span class="net-iface-speed">{{ iface.speed ?? '—' }}</span>
          <span class="net-iface-driver nx-mono">{{ iface.driver ?? '—' }}</span>
        </div>
      </div>
    </div>
    <div v-else class="nx-text-dim">{{ t('common.loading') }}</div>

    <div class="nx-panel-title" style="margin-top: 24px">{{ t('settings.network.dnsConfig') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.network.primaryDns')">
        <el-input v-model="dns1" />
      </el-form-item>
      <el-form-item :label="t('settings.network.secondaryDns')">
        <el-input v-model="dns2" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 24px">{{ t('settings.network.proxy') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.network.enableProxy')">
        <el-switch v-model="proxyEnabled" />
      </el-form-item>
      <template v-if="proxyEnabled">
        <el-form-item :label="t('settings.network.proxyAddr')">
          <el-input v-model="proxyHost" placeholder="127.0.0.1" />
        </el-form-item>
        <el-form-item :label="t('settings.network.proxyPort')">
          <el-input-number v-model="proxyPort" :min="1" :max="65535" />
        </el-form-item>
      </template>
      <el-form-item>
        <el-button type="primary" @click="save">{{ t('common.saveChanges') }}</el-button>
      </el-form-item>
    </el-form>

    <!-- Phase 2: 反向代理 -->
    <div style="margin-top: 24px; border-top: 1px solid var(--nx-border-faint); padding-top: 16px">
      <ProxySettings />
    </div>

    <!-- Phase 2: DDNS -->
    <div style="margin-top: 24px; border-top: 1px solid var(--nx-border-faint); padding-top: 16px">
      <DdnsSettings />
    </div>
  </div>
</template>

<style scoped>
.net-interfaces { display: flex; flex-direction: column; gap: 8px; }
.net-iface-card { padding: 10px 12px; border: 1px solid var(--nx-border-faint); }
.net-iface-head { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.net-iface-speed { color: var(--nx-text-dim); }
.net-iface-driver { color: var(--nx-text-faint); font-size: 11px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot--green { background: var(--nx-green); }
.dot--gray { background: var(--nx-text-faint); }
</style>
