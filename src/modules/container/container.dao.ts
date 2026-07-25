/**
 * 模块3：Docker 与 Tailscale 服务编排 — 数据访问层
 * 封装 Docker CLI 和 Tailscale CLI 的底层调用
 */
import {
  deployContainer,
  restartContainer,
  stopContainer,
  removeContainer,
  listContainers,
  getContainerLogs,
  isDockerAvailable,
} from '../../system/docker.js';
import {
  getTailscaleStatus,
  configureSubnetRouter,
  getSubnetRoutes,
  applyAclPolicy,
  isTailscaleAvailable,
} from '../../system/tailscale.js';
import type {
  ContainerDeployRequest,
  ContainerInfo,
  ContainerLogResult,
  TailscaleStatus,
  SubnetRoute,
} from './container.types.js';

/**
 * 部署容器
 */
export async function createContainer(
  req: ContainerDeployRequest,
): Promise<string> {
  return deployContainer(req);
}

/**
 * 重启容器
 */
export async function restart(nameOrId: string): Promise<void> {
  return restartContainer(nameOrId);
}

/**
 * 停止容器
 */
export async function stop(nameOrId: string): Promise<void> {
  return stopContainer(nameOrId);
}

/**
 * 删除容器
 */
export async function remove(nameOrId: string, force?: boolean): Promise<void> {
  return removeContainer(nameOrId, force);
}

/**
 * 获取容器列表
 */
export async function fetchContainers(all?: boolean): Promise<ContainerInfo[]> {
  return listContainers(all);
}

/**
 * 获取容器日志
 */
export async function fetchLogs(
  nameOrId: string,
  tail?: number,
  since?: string,
): Promise<ContainerLogResult> {
  return getContainerLogs(nameOrId, tail, since);
}

/**
 * 检查 Docker 可用性
 */
export async function checkDockerAvailable(): Promise<boolean> {
  return isDockerAvailable();
}

/**
 * 获取 Tailscale 状态
 */
export async function fetchTailscaleStatus(): Promise<TailscaleStatus> {
  return getTailscaleStatus();
}

/**
 * 配置 Subnet Router
 */
export async function setupSubnetRouter(subnets: string[]): Promise<void> {
  return configureSubnetRouter(subnets);
}

/**
 * 获取 Subnet 路由
 */
export async function fetchSubnetRoutes(): Promise<SubnetRoute[]> {
  return getSubnetRoutes();
}

/**
 * 下发 ACL 策略
 */
export async function pushAclPolicy(policy: string): Promise<void> {
  return applyAclPolicy(policy);
}

/**
 * 检查 Tailscale 可用性
 */
export async function checkTailscaleAvailable(): Promise<boolean> {
  return isTailscaleAvailable();
}
