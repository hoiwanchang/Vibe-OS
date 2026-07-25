/**
 * 模块2：硬件健康与驱动状态监控
 * 导出路由和公共类型
 */
export { default as hardwareRoutes } from './hardware.routes.js';
export type {
  DiskHealthInfo,
  DiskHealthResponse,
  BlockDeviceInfo,
  NetworkDriverInfo,
  NetworkInterfaceInfo,
  NetworkDriversResponse,
} from './hardware.types.js';
