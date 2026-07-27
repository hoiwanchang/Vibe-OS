<script setup lang="ts">
/**
 * 趋势迷你图（SVG 面积折线，零依赖）
 * 用于 CPU/内存历史趋势展示，数据点变化时平滑过渡
 */
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 数据序列（0-100） */
    points: number[];
    /** 线条颜色 */
    color?: string;
    width?: number;
    height?: number;
  }>(),
  { color: 'var(--nx-primary)', width: 160, height: 44 },
);

const PAD = 2;

/** 生成折线 + 面积填充路径 */
const paths = computed(() => {
  const pts = props.points;
  if (pts.length < 2) return { line: '', area: '' };

  const innerW = props.width - PAD * 2;
  const innerH = props.height - PAD * 2;
  const stepX = innerW / (pts.length - 1);

  const coords = pts.map((v, i) => {
    const x = PAD + i * stepX;
    const y = PAD + innerH * (1 - Math.min(Math.max(v, 0), 100) / 100);
    return [x, y] as const;
  });

  const line = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  const last = coords[coords.length - 1] ?? ([0, 0] as const);
  const first = coords[0] ?? ([0, 0] as const);
  const area = `${line} L${last[0].toFixed(1)},${props.height - PAD} L${first[0].toFixed(1)},${props.height - PAD} Z`;

  return { line, area };
});

const gradientId = computed(() => `spark-${Math.random().toString(36).slice(2, 8)}`);
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    class="sparkline"
    preserveAspectRatio="none"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.28" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path v-if="paths.area" :d="paths.area" :fill="`url(#${gradientId})`" />
    <path
      v-if="paths.line"
      :d="paths.line"
      fill="none"
      :stroke="color"
      stroke-width="1.6"
      stroke-linejoin="round"
      stroke-linecap="round"
      class="spark-line"
    />
  </svg>
</template>

<style scoped>
.sparkline {
  display: block;
}

.spark-line {
  transition: d 0.6s ease;
  filter: drop-shadow(0 0 3px currentColor);
}
</style>
