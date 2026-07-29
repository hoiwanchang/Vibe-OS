/**
 * Vitest 全局 setup
 * 单元测试断言以简体中文为基准（formatUptime / nl-parser 的中文输出），
 * 因此固定 i18n locale 为 zh-CN，避免受 happy-dom 默认浏览器语言影响。
 */
import { setLocale } from '@/i18n';

setLocale('zh-CN');
