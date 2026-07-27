/**
 * 模块3：Docker 与 Tailscale 服务编排 — 业务逻辑层
 * 编排容器部署、日志读取、Tailscale 状态查询
 */
import { AppError } from '../../common/app-error.js';
import { assertSafePathReal } from '../../system/filesystem.js';
import * as dao from './container.dao.js';
import type {
  AppDirsInitResponse,
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

  // 安全校验：所有卷挂载的 host 路径必须在 /data/ 内（含 symlink 解析）
  for (const vol of req.volumes ?? []) {
    await assertSafePathReal(vol.host);
  }

  // 校验容器名合法性（防止命令注入）
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(req.name)) {
    throw AppError.badRequest(
      'INVALID_NAME',
      '容器名仅允许字母、数字、下划线、点和连字符',
    );
  }

  // 校验镜像名合法性（防止参数注入：仅允许 registry/repo:tag 格式）
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]*$/.test(req.image)) {
    throw AppError.badRequest(
      'INVALID_IMAGE',
      '镜像名包含非法字符',
    );
  }

  // 校验 memoryLimit 格式（仅允许数字+单位后缀，如 512m, 2g）
  if (req.memoryLimit && !/^\d+[bkmg]$/i.test(req.memoryLimit)) {
    throw AppError.badRequest(
      'INVALID_MEMORY_LIMIT',
      '内存限制格式非法，应为数字+单位（如 512m, 2g）',
    );
  }

  // 校验 network 名称合法性
  if (req.network && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(req.network)) {
    throw AppError.badRequest(
      'INVALID_NETWORK',
      '网络名仅允许字母、数字、下划线、点和连字符',
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

/**
 * 初始化 AI 应用数据目录 /data/naisys/{appname}/{models,data,logs}
 * 供前端"一键部署"在创建容器前调用，保证卷挂载路径存在
 * @param appname - 应用名
 * @returns 应用根目录与新建目录列表
 */
export async function initAppDirs(appname: string): Promise<AppDirsInitResponse> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(appname)) {
    throw AppError.badRequest(
      'INVALID_APPNAME',
      '应用名仅允许字母、数字、下划线、点和连字符，且以字母或数字开头',
    );
  }
  return dao.createAppDirs(appname);
}
