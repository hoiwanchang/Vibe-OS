<script setup lang="ts">
/**
 * 桌面窗口：标题栏（聚焦/最小化/最大化/关闭）+ 内容槽 + 右下角缩放手柄
 * 拖拽与缩放通过 pointer 事件实现，几何统一交由 wm store 钳制管理
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWmStore, type DesktopWindow } from '@/stores/wm';

const props = defineProps<{
  win: DesktopWindow;
}>();

const wm = useWmStore();
const { t } = useI18n();

const isFocused = computed(() => wm.focusedId === props.win.id);

/** 窗口标题（i18n 键 → 实时翻译，切换语言即时生效） */
const title = computed(() => t('wm.titles.' + props.win.title));

/** 窗口定位样式（最大化时铺满工作区） */
const style = computed(() => {
  if (props.win.maximized) {
    return {
      left: '0px',
      top: '0px',
      width: '100%',
      height: 'calc(100% - var(--nx-taskbar-h))',
      zIndex: props.win.z,
    };
  }
  const r = props.win.rect;
  return {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
    zIndex: props.win.z,
  };
});

/** 标题栏拖拽 */
function onTitlebarDown(e: PointerEvent): void {
  if (props.win.maximized) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const origin = { ...props.win.rect };

  function onMove(ev: PointerEvent): void {
    wm.setRect(props.win.id, {
      ...origin,
      x: origin.x + (ev.clientX - startX),
      y: origin.y + (ev.clientY - startY),
    });
  }
  function onUp(): void {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/** 右下角缩放 */
function onResizeDown(e: PointerEvent): void {
  if (props.win.maximized) return;
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startY = e.clientY;
  const origin = { ...props.win.rect };

  function onMove(ev: PointerEvent): void {
    wm.setRect(props.win.id, {
      ...origin,
      w: origin.w + (ev.clientX - startX),
      h: origin.h + (ev.clientY - startY),
    });
  }
  function onUp(): void {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
</script>

<template>
  <div
    class="wm-window wm-window--opening"
    :class="{
      'wm-window--focused': isFocused,
      'wm-window--minimized': win.minimized,
    }"
    :style="style"
    @pointerdown="wm.focus(win.id)"
  >
    <div class="wm-titlebar" @pointerdown="onTitlebarDown" @dblclick="wm.toggleMaximize(win.id)">
      <span class="wm-titlebar__title">{{ title }}</span>
      <button class="wm-titlebar__btn" :title="t('desktop.window.minimize')" @click.stop="wm.minimize(win.id)">—</button>
      <button class="wm-titlebar__btn" :title="t('desktop.window.maximize')" @click.stop="wm.toggleMaximize(win.id)">
        {{ win.maximized ? '❐' : '□' }}
      </button>
      <button class="wm-titlebar__btn wm-titlebar__btn--close" :title="t('desktop.window.close')" @click.stop="wm.close(win.id)">✕</button>
    </div>
    <div class="wm-body">
      <slot />
    </div>
    <div v-if="!win.maximized" class="wm-resize" @pointerdown="onResizeDown" />
  </div>
</template>
