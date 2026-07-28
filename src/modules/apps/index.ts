/**
 * 应用中心模块
 * 导出路由和公共类型
 */
export { default as appsRoutes } from './apps.routes.js';
export type {
  RegistryApp,
  InstalledApp,
  InstalledAppWithStatus,
  DeployFromRegistryRequest,
  DeployCustomRequest,
  DeployResponse,
  LlmConfig,
  AnalyzeRepoRequest,
  AnalyzeRepoResult,
} from './apps.types.js';
