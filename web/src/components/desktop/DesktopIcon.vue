<script setup lang="ts">
/**
 * 桌面图标：方形图标位 + 标签，双击/单击打开对应窗口
 */
import type { DesktopAppId } from '@/stores/wm';

defineProps<{
  label: string;
  appId: DesktopAppId;
}>();

const emit = defineEmits<{
  (e: 'open', id: DesktopAppId): void;
}>();
</script>

<template>
  <button class="nx-desktop-icon" @click="emit('open', appId)">
    <span class="nx-desktop-icon__glyph">
      <slot />
    </span>
    <span class="nx-desktop-icon__label">{{ label }}</span>
  </button>
</template>
