<script setup lang="ts">
/**
 * 任务栏：品牌标识 + 活动窗口按钮 + 实时状态（CPU/内存/告警）+ 时钟
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { demoActive } from '@/api/state';
import { useSystemStore } from '@/stores/system';
import { useWmStore } from '@/stores/wm';

const wm = useWmStore();
const system = useSystemStore();
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
    <div class="nx-taskbar__brand">
      <span class="nx-taskbar__brand-dot" />
      NAISYS
    </div>

    <div class="nx-taskbar__windows">
      <button
        v-for="win in windows"
        :key="win.id"
        class="nx-taskbar__win"
        :class="{ 'nx-taskbar__win--active': focusedId === win.id && !win.minimized }"
        @click="wm.taskbarClick(win.id)"
      >
        {{ win.title }}
      </button>
    </div>

    <div class="nx-taskbar__status">
      <span v-if="demoActive" class="nx-taskbar__status-item" style="color: var(--nx-amber)">
        演示数据
      </span>
      <span v-if="activeAlerts.length > 0" class="nx-taskbar__status-item" style="color: var(--nx-red)">
        ▲ {{ activeAlerts.length }} 告警
      </span>
      <span class="nx-taskbar__status-item">
        CPU {{ (overview?.cpu.usagePercent ?? 0).toFixed(0) }}%
      </span>
      <span class="nx-taskbar__status-item">
        MEM {{ (overview?.memory.usedPercent ?? 0).toFixed(0) }}%
      </span>
    </div>

    <div class="nx-taskbar__clock">
      {{ dateText }}&nbsp;&nbsp;{{ clockText }}
    </div>
  </div>
</template>
