<script setup lang="ts">
/**
 * 状态徽章：在线/离线/运行中/已停止等，带语义呼吸点
 */
import { computed } from 'vue';

const props = defineProps<{
  /** ok | warn | error | off */
  tone: 'ok' | 'warn' | 'error' | 'off';
  text: string;
}>();

const dotClass = computed(() => `nx-dot nx-dot--${props.tone}`);
</script>

<template>
  <span class="status-badge">
    <span :class="dotClass" />
    <span class="status-text">{{ text }}</span>
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  color: var(--nx-text-dim);
}

.status-text {
  white-space: nowrap;
}
</style>
