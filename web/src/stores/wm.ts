/**
 * 窗口管理器（WebOS 桌面核心）
 * 管理桌面窗口的打开 / 关闭 / 最小化 / 最大化 / 聚焦 / 拖拽几何
 * 窗口以 app id 为键，同一应用仅允许一个窗口实例
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

/** 桌面应用 id */
export type DesktopAppId =
  | 'dashboard'
  | 'apps'
  | 'settings'
  | 'tailscale'
  | 'monitor'
  | 'files'
  | 'storage'
  | 'sharing'
  | 'backup'
  | 'download'
  | 'network'
  | 'scheduler'
  | 'search'
  | 'photos'
  | 'music';

/** 窗口几何 */
export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 窗口实例 */
export interface DesktopWindow {
  id: DesktopAppId;
  title: string;
  rect: WindowRect;
  minimized: boolean;
  maximized: boolean;
  /** 聚焦序号（越大越靠前） */
  z: number;
  /** 最大化前的几何（还原用） */
  restoreRect: WindowRect | null;
}

/** 默认窗口尺寸（按应用） */
const DEFAULT_SIZE: Record<DesktopAppId, { w: number; h: number }> = {
  dashboard: { w: 1040, h: 640 },
  apps: { w: 960, h: 620 },
  settings: { w: 960, h: 640 },
  tailscale: { w: 980, h: 640 },
  monitor: { w: 860, h: 560 },
  files: { w: 900, h: 600 },
  storage: { w: 860, h: 580 },
  sharing: { w: 800, h: 520 },
  backup: { w: 820, h: 560 },
  download: { w: 780, h: 560 },
  network: { w: 840, h: 560 },
  scheduler: { w: 800, h: 520 },
  search: { w: 880, h: 600 },
  photos: { w: 960, h: 640 },
  music: { w: 900, h: 600 },
};

/**
 * 窗口标题以 i18n 键呈现（`wm.titles.{id}`），由消费组件经 t() 翻译，
 * 保证切换语言时已打开窗口的标题实时更新。此处仅存 id 作为标题键。
 */

/** 窗口最小尺寸 */
const MIN_W = 420;
const MIN_H = 320;

export const useWmStore = defineStore('wm', () => {
  const windows = ref<DesktopWindow[]>([]);
  /** 自增聚焦序号 */
  let zCounter = 10;
  /** 级联偏移计数（新窗口错开位置） */
  let cascade = 0;

  /** 当前聚焦的窗口 id */
  const focusedId = ref<DesktopAppId | null>(null);

  /** 按 z 升序排列（渲染顺序，越后越靠前） */
  const orderedWindows = computed(() =>
    [...windows.value].sort((a, b) => a.z - b.z),
  );

  /** 可见（未最小化）窗口数 */
  const visibleCount = computed(
    () => windows.value.filter((w) => !w.minimized).length,
  );

  /** 查找窗口 */
  function find(id: DesktopAppId): DesktopWindow | undefined {
    return windows.value.find((w) => w.id === id);
  }

  /** 移动端断点：窄屏时窗口直接全屏打开 */
  const MOBILE_BREAKPOINT = 600;

  /** 是否处于移动端视口 */
  function isMobileViewport(): boolean {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  /** 计算新窗口级联位置（在可用区域内） */
  function cascadeRect(id: DesktopAppId): WindowRect {
    const size = DEFAULT_SIZE[id];
    const vw = window.innerWidth;
    const vh = window.innerHeight - 44; // 预留任务栏
    const offset = (cascade++ % 6) * 28;
    const w = Math.min(size.w, vw - 32);
    const h = Math.min(size.h, vh - 32);
    const x = Math.max(16, Math.min(48 + offset, vw - w - 16));
    const y = Math.max(16, Math.min(40 + offset, vh - h - 16));
    return { x, y, w, h };
  }

  /** 打开应用窗口（已存在则取消最小化并聚焦） */
  function open(id: DesktopAppId): void {
    const existing = find(id);
    if (existing) {
      existing.minimized = false;
      focus(id);
      return;
    }

    // 移动端：直接全屏打开（最大化态），桌面端：级联窗口
    const mobile = isMobileViewport();
    const rect = mobile
      ? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight - 44 }
      : cascadeRect(id);

    windows.value.push({
      id,
      title: id,
      rect,
      minimized: false,
      maximized: mobile,
      z: ++zCounter,
      restoreRect: null,
    });
    focusedId.value = id;
  }

  /** 关闭窗口 */
  function close(id: DesktopAppId): void {
    windows.value = windows.value.filter((w) => w.id !== id);
    if (focusedId.value === id) {
      const top = orderedWindows.value[orderedWindows.value.length - 1];
      focusedId.value = top ? top.id : null;
    }
  }

  /** 聚焦窗口 */
  function focus(id: DesktopAppId): void {
    const win = find(id);
    if (!win) return;
    win.z = ++zCounter;
    win.minimized = false;
    focusedId.value = id;
  }

  /** 最小化窗口 */
  function minimize(id: DesktopAppId): void {
    const win = find(id);
    if (!win) return;
    win.minimized = true;
    if (focusedId.value === id) {
      const top = orderedWindows.value.filter((w) => !w.minimized).pop();
      focusedId.value = top ? top.id : null;
    }
  }

  /** 切换最大化 / 还原 */
  function toggleMaximize(id: DesktopAppId): void {
    const win = find(id);
    if (!win) return;
    if (win.maximized) {
      if (win.restoreRect) win.rect = { ...win.restoreRect };
      win.maximized = false;
      win.restoreRect = null;
    } else {
      win.restoreRect = { ...win.rect };
      win.maximized = true;
    }
    focus(id);
  }

  /** 任务栏点击：最小化窗口点它则还原，否则聚焦 */
  function taskbarClick(id: DesktopAppId): void {
    const win = find(id);
    if (!win) return;
    if (focusedId.value === id && !win.minimized) {
      minimize(id);
    } else {
      focus(id);
    }
  }

  /** 更新窗口几何（拖拽 / 缩放），自动钳制在视口内 */
  function setRect(id: DesktopAppId, rect: WindowRect): void {
    const win = find(id);
    if (!win || win.maximized) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight - 44;
    const w = Math.max(MIN_W, Math.min(rect.w, vw));
    const h = Math.max(MIN_H, Math.min(rect.h, vh));
    const x = Math.max(-w + 120, Math.min(rect.x, vw - 120));
    const y = Math.max(0, Math.min(rect.y, vh - 40));
    win.rect = { x, y, w, h };
  }

  return {
    windows,
    focusedId,
    orderedWindows,
    visibleCount,
    open,
    close,
    focus,
    minimize,
    toggleMaximize,
    taskbarClick,
    setRect,
  };
});
