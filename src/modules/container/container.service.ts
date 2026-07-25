/**
 * 模块3：Docker 与 Tailscale 服务编排 — 业务逻辑层
 * 编排容器部署、日志读取、Tailscale 状态查询
 */
import { AppError } from '../../common/app-error.js';
import { assertSafePath } from '../../system/filesystem.js';
import * as dao from './container.dao.js';
import type {
  ContainerDeployRequest,
  ContainerDeployResponse,
  ContainerInfo,
  ContainerLogResult,
  TailscaleStatusResponse,
} from './container.types.js';

/**
 * 部署 AI 应用容器
 * 校验卷挂载路径安全性后执行部署
 * @param req - 部署请求
 * @returns 部署结果
 */
export async function deployApp(
  req: ContainerDeployRequest,
): Promise<ContainerDeployResponse> {
  // 校验 Docker 可用性
  const dockerOk = await dao.checkDockerAvailable();
  if (!dockerOk) {
    throw AppError.commandFailed('docker', 'Docker 守护进程不可用');
  }

  // 安全校验：所有卷挂载的 host 路径必须在 /data/ 内
  for (const vol of req.volumes ?? []) {
    assertSafePath(vol.host);
  }

  // 校验容器名合法性（防止命令注入）
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(req.name)) {
    throw AppError.badRequest(
      'INVALID_NAME',
      '容器名仅允许字母、数字、下划线、点和连字符',
    );
  }

  const containerId = await dao.createContainer(req);

  return {
    containerId,
    name: req.name,
    image: req.image,
    status: 'deployed',
  };
}

/**
 * 重启指定容器
 */
export async function restartApp(nameOrId: string): Promise<void> {
  await dao.restart(nameOrId);
}

/**
 * 停止指定容器
 */
export async function stopApp(nameOrId: string): Promise<void> {
  await dao.stop(nameOrId);
}

/**
 * 删除指定容器
 */
export async function removeApp(
  nameOrId: string,
  force?: boolean,
): Promise<void> {
  await dao.remove(nameOrId, force);
}

/**
 * 获取所有容器列表
 */
export async function listApps(all?: boolean): Promise<ContainerInfo[]> {
  return dao.fetchContainers(all);
}

/**
 * 读取容器日志
 */
export async function getAppLogs(
  nameOrId: string,
  tail?: number,
  since?: string,
): Promise<ContainerLogResult> {
  return dao.fetchLogs(nameOrId, tail, since);
}

/**
 * 获取 Tailscale 完整状态报告
 * @returns Tailscale 状态 API 响应
 */
export async function getTailscaleReport(): Promise<TailscaleStatusResponse> {
  const available = await dao.checkTailscaleAvailable();

  if (!available) {
    return {
      timestamp: new Date().toISOString(),
      available: false,
      status: {
        backendState: 'NotInstalled',
        self: null,
        peers: [],
        error: 'Tailscale 未安装或不可用',
      },
      subnetRoutes: [],
    };
  }

  const [status, subnetRoutes] = await Promise.all([
    dao.fetchTailscaleStatus(),
    dao.fetchSubnetRoutes(),
  ]);

  return {
    timestamp: new Date().toISOString(),
    available: true,
    status,
    subnetRoutes,
  };
}

/**
 * 配置 Subnet Router
 * @param subnets - 子网 CIDR 列表
 */
export async function setupSubnetRouting(subnets: string[]): Promise<void> {
  // 校验 CIDR 格式
  for (const subnet of subnets) {
    if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(subnet)) {
      throw AppError.badRequest(
        'INVALID_CIDR',
        `无效的子网 CIDR 格式: ${subnet}`,
      );
    }
  }
  await dao.setupSubnetRouter(subnets);
}

/**
 * 下发 ACL 策略
 * @param policy - ACL 策略 JSON 字符串
 */
export async function pushAcl(policy: string): Promise<void> {
  // 校验 JSON 格式
  try {
    JSON.parse(policy);
  } catch {
    throw AppError.badRequest('INVALID_JSON', 'ACL 策略必须为有效 JSON');
  }
  await dao.pushAclPolicy(policy);
}
