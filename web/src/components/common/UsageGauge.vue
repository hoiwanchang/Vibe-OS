<script setup lang="ts">
/**
 * 条形使用率仪表（工业风，零圆角）
 * 横向刻度条 + 大号数值，颜色随阈值语义变化，宽度变化带平滑过渡
 */
import { computed, ref, watch } from 'vue';
import { clamp, usageLevel } from '@/utils/format';

const props = withDefaults(
  defineProps<{
    /** 使用率百分比 0-100 */
    percent: number;
    /** 主数值文本（默认显示百分比） */
    label?: string;
    /** 副标题 */
    caption?: string;
  }>(),
  { label: undefined, caption: undefined },
);

/** 动画后的展示值（驱动宽度过渡） */
const animated = ref(0);

watch(
  () => props.percent,
  (v) => {
    animated.value = clamp(v, 0, 100);
  },
  { immediate: true },
);

const level = computed(() => usageLevel(props.percent));

const barColor = computed(() => {
  switch (level.value) {
    case 'critical':
      return 'var(--nx-red)';
    case 'warn':
      return 'var(--nx-amber)';
    default:
      return 'var(--nx-green)';
  }
});

const displayValue = computed(() =>
  props.label ?? `${animated.value.toFixed(1)}%`,
);
</script>

<template>
  <div class="bar-gauge">
    <div class="bar-gauge__head">
      <span class="bar-gauge__value" :style="{ color: barColor }">
        {{ displayValue }}
      </span>
      <span v-if="caption" class="bar-gauge__caption">{{ caption }}</span>
    </div>
    <div class="bar-gauge__track">
      <div
        class="bar-gauge__fill"
        :style="{ width: `${animated}%`, background: barColor }"
      />
    </div>
  </div>
</template>

<style scoped>
.bar-gauge {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.bar-gauge__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.bar-gauge__value {
  font-family: var(--nx-font-display);
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  transition: color 0.4s ease;
}

.bar-gauge__caption {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--nx-text-faint);
}

.bar-gauge__track {
  position: relative;
  height: 10px;
  background: var(--nx-border-faint);
  border: 1px solid var(--nx-border);
  overflow: hidden;
}

/* 刻度纹理 */
.bar-gauge__track::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent calc(10% - 1px),
    rgba(255, 255, 255, 0.08) calc(10% - 1px),
    rgba(255, 255, 255, 0.08) 10%
  );
  pointer-events: none;
}

.bar-gauge__fill {
  height: 100%;
  transition: width 0.9s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s ease;
}
</style>
