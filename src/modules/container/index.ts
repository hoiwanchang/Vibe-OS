/**
 * 模块3：Docker 与 Tailscale 服务编排
 * 导出路由和公共类型
 */
export { default as containerRoutes } from './container.routes.js';
export type {
  ContainerDeployRequest,
  ContainerDeployResponse,
  ContainerInfo,
  ContainerLogResult,
  TailscaleStatus,
  TailscalePeer,
  SubnetRoute,
  TailscaleStatusResponse,
} from './container.types.js';
