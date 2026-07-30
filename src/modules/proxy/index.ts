/**
 * 模块：反向代理管理 — 导出
 */
export { default as proxyRoutes } from './proxy.routes.js';
export * as proxyService from './proxy.service.js';
export type {
  ProxyRule,
  CreateProxyRuleInput,
  UpdateProxyRuleInput,
  ProxyCertInfo,
  GenerateCertInput,
  ReloadResult,
  ProxyStatus,
  ProxyProtocol,
} from './proxy.types.js';
