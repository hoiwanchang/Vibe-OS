<script setup lang="ts">
/**
 * 关于：版本信息、系统摘要、重启/关机
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { settingsApi } from '@/api';
import { formatBytes, formatUptime } from '@/utils/format';

const { t } = useI18n();

const store = useSettingsStore();
const { about } = storeToRefs(store);
const loading = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    await store.fetchAbout();
  } finally {
    loading.value = false;
  }
});

async function doReboot(): Promise<void> {
  try {
    await ElMessageBox.prompt(t('settings.about.rebootConfirm'), t('settings.about.rebootTitle'), {
      confirmButtonText: t('common.reboot'),
      cancelButtonText: t('common.cancel'),
      inputPattern: /^confirm$/,
      inputErrorMessage: t('settings.about.enterConfirm'),
      type: 'warning',
    });
    await settingsApi.reboot();
    ElMessage.warning(t('settings.about.rebooting'));
  } catch { /* 取消 */ }
}

async function doShutdown(): Promise<void> {
  try {
    await ElMessageBox.prompt(t('settings.about.shutdownConfirm'), t('settings.about.shutdownTitle'), {
      confirmButtonText: t('common.shutdown'),
      cancelButtonText: t('common.cancel'),
      inputPattern: /^confirm$/,
      inputErrorMessage: t('settings.about.enterConfirm'),
      type: 'warning',
    });
    await settingsApi.shutdown();
    ElMessage.warning(t('settings.about.shuttingDown'));
  } catch { /* 取消 */ }
}
</script>

<template>
  <div class="nx-panel settings-section" v-loading="loading">
    <div class="about-brand">
      <div class="about-logo">NAI<em>SYS</em></div>
      <div class="about-sub">PRIVATE AI NAS</div>
    </div>

    <dl v-if="about" class="about-list">
      <div><dt>{{ t('common.version') }}</dt><dd class="nx-mono">v{{ about.version }}</dd></div>
      <div><dt>{{ t('common.buildDate') }}</dt><dd class="nx-mono">{{ about.buildDate }}</dd></div>
      <div><dt>Node.js</dt><dd class="nx-mono">{{ about.nodeVersion }}</dd></div>
      <div><dt>{{ t('common.os') }}</dt><dd class="nx-mono">{{ about.osVersion }}</dd></div>
      <div><dt>{{ t('common.kernel') }}</dt><dd class="nx-mono">{{ about.kernel }}</dd></div>
      <div><dt>{{ t('common.cpu') }}</dt><dd class="nx-mono">{{ about.cpuModel }} · {{ about.cpuCores }} {{ t('common.cores') }}</dd></div>
      <div><dt>{{ t('common.memory') }}</dt><dd class="nx-mono">{{ formatBytes(about.totalMemoryBytes) }}</dd></div>
      <div><dt>{{ t('common.hostname') }}</dt><dd class="nx-mono">{{ about.hostname }}</dd></div>
      <div><dt>{{ t('common.uptime') }}</dt><dd class="nx-mono">{{ formatUptime(about.uptimeSeconds) }}</dd></div>
      <div><dt>{{ t('common.dataDir') }}</dt><dd class="nx-mono">{{ about.dataRoot }}</dd></div>
      <div><dt>{{ t('common.license') }}</dt><dd class="nx-mono">{{ about.license }}</dd></div>
    </dl>

    <div class="about-actions">
      <el-button type="warning" @click="doReboot">{{ t('common.reboot') }}</el-button>
      <el-button type="danger" @click="doShutdown">{{ t('common.shutdown') }}</el-button>
    </div>
  </div>
</template>

<style scoped>
.about-brand {
  text-align: center;
  padding: 24px 0 16px;
}
.about-logo {
  font-family: var(--nx-font-display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.about-logo em {
  font-style: normal;
  color: var(--nx-amber);
}
.about-sub {
  font-size: 11px;
  letter-spacing: 0.3em;
  color: var(--nx-text-faint);
  margin-top: 4px;
}
.about-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
  margin: 0;
}
.about-list > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--nx-border-faint);
}
.about-list dt {
  color: var(--nx-text-faint);
  font-size: 12px;
  flex-shrink: 0;
}
.about-list dd {
  margin: 0;
  font-size: 12px;
  text-align: right;
  word-break: break-all;
}
.about-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
}
@media (max-width: 640px) {
  .about-list { grid-template-columns: 1fr; }
}
</style>
