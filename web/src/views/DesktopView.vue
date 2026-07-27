<script setup lang="ts">
/**
 * WebOS 桌面主视图
 * - 开机动画 → 桌面（点阵网格背景）
 * - 桌面图标：由应用注册表驱动（dashboard/apps/settings/tailscale）
 * - 窗口层：各功能以可拖拽窗口呈现（含 Tailscale / 资源监视器）
 * - 桌面小组件栏（右侧：时钟/资源/存储/网络）
 * - 开始菜单（左下角品牌按钮触发）
 * - 告警中心面板（任务栏告警指示器触发）
 * - 统一 5s 轮询（任务栏实时状态 + 各窗口数据共用）
 * - 硬件 critical 告警全局弹窗（按 id 去重，仅新告警弹一次）
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import AlertsPanel from '@/components/desktop/AlertsPanel.vue';
import AppWindow from '@/components/desktop/AppWindow.vue';
import { DESKTOP_APPS } from '@/components/desktop/desktop-registry';
import DesktopIcon from '@/components/desktop/DesktopIcon.vue';
import DesktopTaskbar from '@/components/desktop/DesktopTaskbar.vue';
import DesktopWidgets from '@/components/desktop/DesktopWidgets.vue';
import StartMenu from '@/components/desktop/StartMenu.vue';
import AppsView from '@/views/AppsView.vue';
import BackupView from '@/views/BackupView.vue';
import DashboardView from '@/views/DashboardView.vue';
import DownloadView from '@/views/DownloadView.vue';
import FilesView from '@/views/FilesView.vue';
import MonitorView from '@/views/MonitorView.vue';
import NetworkView from '@/views/NetworkView.vue';
import SchedulerView from '@/views/SchedulerView.vue';
import SettingsView from '@/views/SettingsView.vue';
import SharingView from '@/views/SharingView.vue';
import StorageView from '@/views/StorageView.vue';
import TailscaleView from '@/views/TailscaleView.vue';
import { useSystemStore, POLL_INTERVAL_MS } from '@/stores/system';
import { useWmStore } from '@/stores/wm';

const wm = useWmStore();
const system = useSystemStore();
const { orderedWindows } = storeToRefs(wm);
const { activeAlerts } = storeToRefs(system);

/** 开机动画状态 */
const booted = ref(false);

/** 开始菜单开关 */
const startMenuOpen = ref(false);

/** 告警中心面板开关 */
const alertsOpen = ref(false);

/** 桌面图标列表（注册表中 onDesktop 的应用） */
const desktopApps = DESKTOP_APPS.filter((a) => a.onDesktop);

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
      <div class="nx-boot__logo">Vibe<em>OS</em></div>
      <div class="nx-boot__bar"><div class="nx-boot__bar-fill" /></div>
      <div class="nx-boot__text">INITIALIZING SYSTEM…</div>
    </div>

    <template v-else>
      <!-- 桌面图标（注册表驱动） -->
      <div class="nx-icon-grid">
        <DesktopIcon
          v-for="app in desktopApps"
          :key="app.id"
          :label="app.title"
          :app-id="app.id"
          @open="wm.open"
        >
          <el-icon><component :is="app.icon" /></el-icon>
        </DesktopIcon>
      </div>

      <!-- 桌面小组件栏 -->
      <DesktopWidgets />

      <!-- 窗口层 -->
      <AppWindow v-for="win in orderedWindows" :key="win.id" :win="win">
        <DashboardView v-if="win.id === 'dashboard'" />
        <AppsView v-else-if="win.id === 'apps'" />
        <SettingsView v-else-if="win.id === 'settings'" />
        <TailscaleView v-else-if="win.id === 'tailscale'" />
        <FilesView v-else-if="win.id === 'files'" />
        <StorageView v-else-if="win.id === 'storage'" />
        <SharingView v-else-if="win.id === 'sharing'" />
        <BackupView v-else-if="win.id === 'backup'" />
        <DownloadView v-else-if="win.id === 'download'" />
        <NetworkView v-else-if="win.id === 'network'" />
        <SchedulerView v-else-if="win.id === 'scheduler'" />
        <MonitorView v-else />
      </AppWindow>

      <!-- 开始菜单 -->
      <StartMenu v-if="startMenuOpen" @close="startMenuOpen = false" />

      <!-- 告警中心面板 -->
      <AlertsPanel v-if="alertsOpen" @close="alertsOpen = false" />

      <!-- 任务栏 -->
      <DesktopTaskbar
        :start-menu-open="startMenuOpen"
        :alerts-open="alertsOpen"
        @toggle-start-menu="startMenuOpen = !startMenuOpen; alertsOpen = false"
        @toggle-alerts="alertsOpen = !alertsOpen; startMenuOpen = false"
        @open-app="wm.open"
      />
    </template>
  </div>
</template>
