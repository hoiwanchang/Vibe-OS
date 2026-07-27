<script setup lang="ts">
/**
 * WebOS 桌面主视图
 * - 开机动画 → 桌面（点阵网格背景）
 * - 桌面图标：仪表盘 / 应用中心 / 系统设置
 * - 窗口层：各功能以可拖拽窗口呈现
 * - 统一 5s 轮询（任务栏实时状态 + 各窗口数据共用）
 * - 硬件 critical 告警全局弹窗（按 id 去重，仅新告警弹一次）
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Grid, Odometer, Setting } from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import AppWindow from '@/components/desktop/AppWindow.vue';
import DesktopIcon from '@/components/desktop/DesktopIcon.vue';
import DesktopTaskbar from '@/components/desktop/DesktopTaskbar.vue';
import AppsView from '@/views/AppsView.vue';
import DashboardView from '@/views/DashboardView.vue';
import SettingsView from '@/views/SettingsView.vue';
import { useSystemStore, POLL_INTERVAL_MS } from '@/stores/system';
import { useWmStore } from '@/stores/wm';

const wm = useWmStore();
const system = useSystemStore();
const { orderedWindows } = storeToRefs(wm);
const { activeAlerts } = storeToRefs(system);

/** 开机动画状态 */
const booted = ref(false);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let bootTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  // 开机动画
  bootTimer = setTimeout(() => {
    booted.value = true;
  }, 1300);

  // 统一轮询（桌面级，供任务栏与各窗口共用）
  await system.fetchAll();
  pollTimer = setInterval(() => {
    void system.fetchAll();
  }, POLL_INTERVAL_MS);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
  if (bootTimer) clearTimeout(bootTimer);
});

/**
 * 硬件 critical 告警 → 全局弹窗（仅新告警弹一次）
 * activeAlerts 每次轮询产生新数组引用，必须按 id 去重
 */
const poppedAlertIds = ref<Set<string>>(new Set());

watch(activeAlerts, (alerts) => {
  const fresh = alerts.filter(
    (a) => a.severity === 'critical' && !poppedAlertIds.value.has(a.id),
  );
  if (fresh.length === 0) return;

  for (const alert of fresh) {
    poppedAlertIds.value.add(alert.id);
  }

  const critical = fresh[0];
  if (critical) {
    ElMessageBox.alert(critical.detail, critical.title, {
      confirmButtonText: '知道了',
      type: 'error',
      customClass: 'nx-critical-dialog',
    }).catch(() => {
      /* 用户关闭弹窗 */
    });
  }
});

onBeforeUnmount(() => {
  poppedAlertIds.value.clear();
});
</script>

<template>
  <div class="nx-desktop">
    <!-- 开机动画 -->
    <div v-if="!booted" class="nx-boot">
      <div class="nx-boot__logo">NAI<em>SYS</em></div>
      <div class="nx-boot__bar"><div class="nx-boot__bar-fill" /></div>
      <div class="nx-boot__text">INITIALIZING SYSTEM…</div>
    </div>

    <template v-else>
      <!-- 桌面图标 -->
      <div class="nx-icon-grid">
        <DesktopIcon label="仪表盘" app-id="dashboard" @open="wm.open">
          <el-icon><Odometer /></el-icon>
        </DesktopIcon>
        <DesktopIcon label="应用中心" app-id="apps" @open="wm.open">
          <el-icon><Grid /></el-icon>
        </DesktopIcon>
        <DesktopIcon label="系统设置" app-id="settings" @open="wm.open">
          <el-icon><Setting /></el-icon>
        </DesktopIcon>
      </div>

      <!-- 窗口层 -->
      <AppWindow v-for="win in orderedWindows" :key="win.id" :win="win">
        <DashboardView v-if="win.id === 'dashboard'" />
        <AppsView v-else-if="win.id === 'apps'" />
        <SettingsView v-else />
      </AppWindow>

      <!-- 任务栏 -->
      <DesktopTaskbar />
    </template>
  </div>
</template>
