/**
 * 国际化基础设施
 * - 自动检测浏览器语言（navigator.language），中文环境 → zh-CN，其余 → en
 * - localStorage 持久化用户手动切换的选择（优先级最高）
 * - 支持 zh-CN / en 两种语言，fallback 到 en
 * - 暴露 setLocale 供设置中心语言切换调用
 */
import { createI18n } from 'vue-i18n';
import en from './locales/en';
import zhCN from './locales/zh-CN';

/** 应用支持的语言 */
export type AppLocale = 'zh-CN' | 'en';

/** localStorage 持久化键 */
const STORAGE_KEY = 'vibeos-locale';

/**
 * 检测初始语言
 * 优先级：localStorage 手动选择 > 浏览器语言 > en
 */
export function detectLocale(): AppLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch {
    /* localStorage 不可用时忽略 */
  }
  const nav = (navigator.language ?? '').toLowerCase();
  if (nav.startsWith('zh')) return 'zh-CN';
  return 'en';
}

/** 持久化语言选择 */
export function persistLocale(locale: AppLocale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* 忽略 */
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { 'zh-CN': zhCN, en },
});

/**
 * 切换语言：更新 i18n locale + 持久化 + 同步 <html lang>
 */
export function setLocale(locale: AppLocale): void {
  // vue-i18n Composition 模式下 locale 是 ref
  (i18n.global.locale as unknown as { value: AppLocale }).value = locale;
  persistLocale(locale);
  document.documentElement.lang = locale;
}

// 初始化 <html lang>
document.documentElement.lang = i18n.global.locale.value as string;

/**
 * 供 store / 工具函数（组件外）使用的翻译函数
 * Composition 模式下 composer.t 可安全解构，且对 locale 变化保持响应式
 */
export const { t } = i18n.global;
