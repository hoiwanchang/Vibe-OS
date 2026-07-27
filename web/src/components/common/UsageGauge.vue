<script setup lang="ts">
/**
 * 环形使用率仪表（SVG 实现，零第三方依赖）
 * 数值变化带平滑过渡动画，颜色随阈值语义变化
 */
import { computed, ref, watch } from 'vue';
import { clamp, usageLevel } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    /** 使用率百分比 0-100 */
    percent: number;
    /** 环内主数值文本 */
    label?: string;
    /** 环内副标题 */
    caption?: string;
    /** 尺寸（px） */
    size?: number;
  }>(),
  { size: 150, label: undefined, caption: undefined },
);

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 动画后的展示值（ref 驱动 CSS transition） */
const animated = ref(0);

watch(
  () => props.percent,
  (v) => {
    animated.value = clamp(v, 0, 100);
  },
  { immediate: true },
);

const dashOffset = computed(
  () => CIRCUMFERENCE * (1 - animated.value / 100),
);

const level = computed(() => usageLevel(props.percent));

const strokeColor = computed(() => {
  switch (level.value) {
    case 'critical':
      return 'var(--nx-red)';
    case 'warn':
      return 'var(--nx-amber)';
    default:
      return 'var(--nx-primary)';
  }
});

const displayValue = computed(() =>
  props.label ?? `${animated.value.toFixed(1)}%`,
);
</script>

<template>
  <div class="gauge" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg :viewBox="`0 0 ${size} ${size}`" class="gauge-svg">
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="RADIUS"
        fill="none"
        stroke="var(--nx-border)"
        stroke-width="10"
      />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="RADIUS"
        fill="none"
        :stroke="strokeColor"
        stroke-width="10"
        stroke-linecap="round"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
        :transform="`rotate(-90 ${size / 2} ${size / 2})`"
        class="gauge-arc"
      />
    </svg>
    <div class="gauge-center">
      <div class="gauge-value" :style="{ color: strokeColor }">
        {{ displayValue }}
      </div>
      <div v-if="caption" class="gauge-caption">{{ caption }}</div>
    </div>
  </div>
</template>

<style scoped>
.gauge {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.gauge-svg {
  width: 100%;
  height: 100%;
}

.gauge-arc {
  transition: stroke-dashoffset 0.9s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s ease;
  filter: drop-shadow(0 0 6px currentColor);
}

.gauge-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.gauge-value {
  font-family: 'Space Grotesk', 'JetBrains Mono', monospace;
  font-size: 24px;
  font-weight: 700;
  transition: color 0.4s ease;
}

.gauge-caption {
  font-size: 11px;
  color: var(--nx-text-faint);
  letter-spacing: 1px;
}
</style>
