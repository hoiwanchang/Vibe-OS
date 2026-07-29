<script setup lang="ts">
/**
 * 关于：版本信息、系统摘要、重启/关机
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { settingsApi } from '@/api';
import { formatBytes, formatUptime } from '@/utils/format';

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
    await ElMessageBox.prompt('输入 "confirm" 确认重启系统', '重启确认', {
      confirmButtonText: '重启',
      cancelButtonText: '取消',
      inputPattern: /^confirm$/,
      inputErrorMessage: '请输入 confirm',
      type: 'warning',
    });
    await settingsApi.reboot();
    ElMessage.warning('系统正在重启…');
  } catch { /* 取消 */ }
}

async function doShutdown(): Promise<void> {
  try {
    await ElMessageBox.prompt('输入 "confirm" 确认关机', '关机确认', {
      confirmButtonText: '关机',
      cancelButtonText: '取消',
      inputPattern: /^confirm$/,
      inputErrorMessage: '请输入 confirm',
      type: 'warning',
    });
    await settingsApi.shutdown();
    ElMessage.warning('系统正在关机…');
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
      <div><dt>版本</dt><dd class="nx-mono">v{{ about.version }}</dd></div>
      <div><dt>构建日期</dt><dd class="nx-mono">{{ about.buildDate }}</dd></div>
      <div><dt>Node.js</dt><dd class="nx-mono">{{ about.nodeVersion }}</dd></div>
      <div><dt>操作系统</dt><dd class="nx-mono">{{ about.osVersion }}</dd></div>
      <div><dt>内核</dt><dd class="nx-mono">{{ about.kernel }}</dd></div>
      <div><dt>CPU</dt><dd class="nx-mono">{{ about.cpuModel }} · {{ about.cpuCores }} 核</dd></div>
      <div><dt>内存</dt><dd class="nx-mono">{{ formatBytes(about.totalMemoryBytes) }}</dd></div>
      <div><dt>主机名</dt><dd class="nx-mono">{{ about.hostname }}</dd></div>
      <div><dt>运行时长</dt><dd class="nx-mono">{{ formatUptime(about.uptimeSeconds) }}</dd></div>
      <div><dt>数据目录</dt><dd class="nx-mono">{{ about.dataRoot }}</dd></div>
      <div><dt>许可证</dt><dd class="nx-mono">{{ about.license }}</dd></div>
    </dl>

    <div class="about-actions">
      <el-button type="warning" @click="doReboot">重启系统</el-button>
      <el-button type="danger" @click="doShutdown">关机</el-button>
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
