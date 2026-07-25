/**
 * 模块1：系统初始化与数据目录管理
 * 导出路由和公共类型
 */
export { default as systemInitRoutes } from './system-init.routes.js';
export type {
  InitDataRequest,
  InitDataResult,
  UserQuotaInfo,
  UserMapping,
  PermissionCheckResult,
} from './system-init.types.js';
