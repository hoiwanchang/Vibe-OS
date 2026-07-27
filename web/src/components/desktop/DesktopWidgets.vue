<script setup lang="ts">
/**
 * 桌面小组件栏（右侧固定排列）
 * - 时钟：大号等宽时间 + 日期
 * - 资源监视：CPU / 内存实时使用率 + 迷你趋势图
 * - 存储池：数据盘聚合使用率条
 * - 网络：Tailscale 在线状态 + 节点统计
 * 小组件为只读速览，点击可唤起对应详情窗口
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import TrendSparkline from '@/components/common/TrendSparkline.vue';
import { useSystemStore } from '@/stores/system';
import { useWmStore } from '@/stores/wm';
import { formatBytes } from '@/utils/format';

const system = useSystemStore();
const wm = useWmStore();
const { overview, tailscale, cpuHistory, memHistory } = storeToRefs(system);

/** 时钟（独立 1s 计时，不依赖系统轮询） */
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

const hhmm = ref('');
const seconds = ref('');
const dateLine = ref('');
const weekday = ref('');

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function tick(): void {
  const d = now.value;
  hhmm.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  seconds.value = pad(d.getSeconds());
  dateLine.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  weekday.value = WEEKDAYS[d.getDay()] ?? '';
}

watch(now, tick, { immediate: true });

/** 存储池聚合（/data 前缀挂载点） */
const dataPool = computed(() => {
  const pools = overview.value?.storage ?? [];
  const dataPools = pools.filter((p) => p.mountPoint.startsWith('/data'));
  const total = dataPools.reduce((s, p) => s + p.totalBytes, 0);
  const used = dataPools.reduce((s, p) => s + p.usedBytes, 0);
  return {
    total,
    used,
    percent: total > 0 ? (used / total) * 100 : 0,
  };
});

/** Tailscale 统计 */
const tsStats = computed(() => {
  const peers = tailscale.value?.status.peers ?? [];
  const online = peers.filter((p) => p.online).length;
  return {
    online,
    total: peers.length,
    selfOnline: tailscale.value?.status.self?.online ?? false,
    backend: tailscale.value?.status.backendState ?? 'Unknown',
  };
});

/** 使用率颜色 */
function levelColor(pct: number): string {
  if (pct >= 90) return 'var(--nx-red)';
  if (pct >= 75) return 'var(--nx-amber)';
  return 'var(--nx-green)';
}
</script>

<template>
  <div class="nx-widgets">
    <!-- 时钟 -->
    <div class="nx-widget nx-widget--clock">
      <div class="nx-widget-clock__time">
        {{ hhmm }}<span class="nx-widget-clock__sec">:{{ seconds }}</span>
      </div>
      <div class="nx-widget-clock__date">{{ dateLine }} · {{ weekday }}</div>
    </div>

    <!-- 资源监视 -->
    <button class="nx-widget nx-widget--clickable" @click="wm.open('dashboard')">
      <div class="nx-widget__title">资源监视</div>
      <div class="nx-widget-res">
        <div class="nx-widget-res__row">
          <span class="nx-widget-res__label">CPU</span>
          <div class="nx-widget-res__bar">
            <div
              class="nx-widget-res__fill"
              :style="{
                width: `${overview?.cpu.usagePercent ?? 0}%`,
                background: levelColor(overview?.cpu.usagePercent ?? 0),
              }"
            />
          </div>
          <span class="nx-widget-res__val">{{ (overview?.cpu.usagePercent ?? 0).toFixed(0) }}%</span>
        </div>
        <TrendSparkline
          v-if="cpuHistory.length >= 2"
          :points="cpuHistory"
          color="var(--nx-amber)"
          :width="200"
          :height="26"
        />
        <div class="nx-widget-res__row">
          <span class="nx-widget-res__label">MEM</span>
          <div class="nx-widget-res__bar">
            <div
              class="nx-widget-res__fill"
              :style="{
                width: `${overview?.memory.usedPercent ?? 0}%`,
                background: levelColor(overview?.memory.usedPercent ?? 0),
              }"
            />
          </div>
          <span class="nx-widget-res__val">{{ (overview?.memory.usedPercent ?? 0).toFixed(0) }}%</span>
        </div>
        <TrendSparkline
          v-if="memHistory.length >= 2"
          :points="memHistory"
          color="var(--nx-green)"
          :width="200"
          :height="26"
        />
      </div>
    </button>

    <!-- 存储池 -->
    <button class="nx-widget nx-widget--clickable" @click="wm.open('dashboard')">
      <div class="nx-widget__title">存储池</div>
      <div class="nx-widget-storage__percent" :style="{ color: levelColor(dataPool.percent) }">
        {{ dataPool.percent.toFixed(1) }}%
      </div>
      <div class="nx-widget-res__bar">
        <div
          class="nx-widget-res__fill"
          :style="{ width: `${dataPool.percent}%`, background: levelColor(dataPool.percent) }"
        />
      </div>
      <div class="nx-widget-storage__detail nx-mono">
        {{ formatBytes(dataPool.used) }} / {{ formatBytes(dataPool.total) }}
      </div>
    </button>

    <!-- 网络 / Tailscale -->
    <button class="nx-widget nx-widget--clickable" @click="wm.open('tailscale')">
      <div class="nx-widget__title">TAILSCALE 网络</div>
      <div class="nx-widget-net__status">
        <span class="nx-dot" :class="tsStats.selfOnline ? 'nx-dot--ok' : 'nx-dot--error'" />
        <span class="nx-widget-net__state">{{ tsStats.selfOnline ? '已连接' : '未连接' }}</span>
      </div>
      <div class="nx-widget-net__peers nx-mono">
        节点 {{ tsStats.online }} / {{ tsStats.total }} 在线
      </div>
    </button>
  </div>
</template>
