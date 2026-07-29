<script setup lang="ts">
/**
 * 任务栏（底部）
 * - 左侧品牌按钮：触发开始菜单
 * - 中部活动窗口按钮：点击聚焦/还原/最小化
 * - 右侧状态区（可点击跳转）：
 *     · 告警指示器 → 打开告警中心面板
 *     · CPU / 内存 → 打开仪表盘窗口
 * - 最右时钟
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { demoActive } from '@/api/state';
import NotificationBell from '@/components/desktop/NotificationBell.vue';
import { useSystemStore } from '@/stores/system';
import { useWmStore } from '@/stores/wm';
import type { DesktopAppId } from '@/stores/wm';

defineProps<{
  /** 开始菜单是否展开（用于高亮品牌按钮） */
  startMenuOpen: boolean;
  /** 告警面板是否展开（用于高亮告警指示器） */
  alertsOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-start-menu'): void;
  (e: 'toggle-alerts'): void;
  (e: 'open-app', id: DesktopAppId): void;
}>();

const wm = useWmStore();
const system = useSystemStore();
const { t } = useI18n();
const { windows, focusedId } = storeToRefs(wm);
const { overview, activeAlerts } = storeToRefs(system);

/** 时钟 */
const now = ref(new Date());
let clockTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = new Date();
  }, 1000);
});

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer);
});

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const clockText = ref('');
const dateText = ref('');

/** 每秒格式化（避免模板内重复计算） */
function tick(): void {
  const d = now.value;
  clockText.value = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  dateText.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 响应式触发
watch(now, tick, { immediate: true });
</script>

<template>
  <div class="nx-taskbar">
    <!-- 品牌按钮 → 开始菜单 -->
    <button
      class="nx-taskbar__brand"
      :class="{ 'nx-taskbar__brand--active': startMenuOpen }"
      @click="emit('toggle-start-menu')"
    >
      <span class="nx-taskbar__brand-dot" />
      <span class="nx-taskbar__brand-name">Vibe OS</span>
    </button>

    <!-- 活动窗口按钮 -->
    <div class="nx-taskbar__windows">
      <button
        v-for="win in windows"
        :key="win.id"
        class="nx-taskbar__win"
        :class="{ 'nx-taskbar__win--active': focusedId === win.id && !win.minimized }"
        @click="wm.taskbarClick(win.id)"
      >
        {{ t('wm.titles.' + win.title) }}
      </button>
    </div>

    <!-- 状态区（可点击跳转） -->
    <div class="nx-taskbar__status">
      <span v-if="demoActive" class="nx-taskbar__status-item nx-taskbar__status-item--demo">
        {{ t('desktop.taskbar.demoData') }}
      </span>

      <button
        v-if="activeAlerts.length > 0"
        class="nx-taskbar__status-item nx-taskbar__status-item--alert"
        :class="{ 'nx-taskbar__status-item--active': alertsOpen }"
        @click="emit('toggle-alerts')"
      >
        {{ t('desktop.taskbar.alerts', { count: activeAlerts.length }) }}
      </button>

      <button
        class="nx-taskbar__status-item nx-taskbar__status-item--clickable"
        :title="t('desktop.taskbar.openDashboard')"
        @click="emit('open-app', 'dashboard')"
      >
        CPU {{ (overview?.cpu.usagePercent ?? 0).toFixed(0) }}%
      </button>
      <button
        class="nx-taskbar__status-item nx-taskbar__status-item--clickable"
        :title="t('desktop.taskbar.openDashboard')"
        @click="emit('open-app', 'dashboard')"
      >
        MEM {{ (overview?.memory.usedPercent ?? 0).toFixed(0) }}%
      </button>

      <!-- 通知铃铛（未读角标 + popover 面板） -->
      <NotificationBell />
    </div>

    <!-- 时钟 -->
    <div class="nx-taskbar__clock">
      {{ dateText }}&nbsp;&nbsp;{{ clockText }}
    </div>
  </div>
</template>
