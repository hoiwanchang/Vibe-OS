/**
 * 主题管理：深色 / 浅色 / 跟随系统
 * 通过 html 元素的 class 切换（dark / light）驱动 CSS 变量
 */

export type ThemeMode = 'dark' | 'light' | 'system';

const STORAGE_KEY = 'vibeos-theme';

let mediaQuery: MediaQueryList | null = null;

/** 获取持久化的主题偏好 */
export function getStoredTheme(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'dark' || v === 'light' || v === 'system') return v;
  return 'dark'; // 默认深色工业风
}

/** 应用主题到 DOM */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');

  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.add(prefersDark ? 'dark' : 'light');
  } else {
    root.classList.add(mode);
  }
}

/** 设置主题并持久化 */
export function setTheme(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  applyTheme(mode);
  // 跟随系统时监听变化
  setupSystemListener(mode);
}

/** 初始化主题（应用启动时调用） */
export function initTheme(): void {
  const mode = getStoredTheme();
  applyTheme(mode);
  setupSystemListener(mode);
}

function setupSystemListener(mode: ThemeMode): void {
  // 清除旧监听
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', onSystemChange);
    mediaQuery = null;
  }
  if (mode !== 'system') return;

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', onSystemChange);
}

function onSystemChange(): void {
  // 仅在 system 模式下响应
  if (getStoredTheme() !== 'system') return;
  applyTheme('system');
}
