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
  TailscaleAccount,
  TailscaleLoginRequest,
  TailscaleLoginResponse,
  TailscaleManageReport,
  TailscalePrefs,
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
 * 初始化 AI 应用数据目录 /data/vibeos/{appname}/{models,data,logs}
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

/* ---------- Tailscale 多账户 / HeadScale 管理 ---------- */

/**
 * 登录 Tailscale 控制平面（支持第三方 headscale 服务器）
 *
 * 成功后将该账户登记到本地注册表（/data/vibeos/tailscale/accounts.json），
 * 并标记为当前激活账户，实现多账户管理。
 *
 * @param req - 登录请求（controlUrl / authKey / label / exitNode / acceptRoutes）
 * @returns 登录结果（后端状态、认证 URL、激活账户）
 */
export async function loginTailscale(
  req: TailscaleLoginRequest,
): Promise<TailscaleLoginResponse> {
  const available = await dao.checkTailscaleAvailable();
  if (!available) {
    throw AppError.commandFailed('tailscale', 'Tailscale 未安装或不可用');
  }

  const result = await dao.loginTailscale({
    controlUrl: req.controlUrl,
    authKey: req.authKey,
    exitNode: req.exitNode,
    acceptRoutes: req.acceptRoutes,
  });

  // 校验登录结果：
  // - exitCode === 0：登录成功
  // - exitCode !== 0 且有 authUrl：等待浏览器授权（合法交互流程，继续登记）
  // - exitCode !== 0 且无 authUrl：真正失败（服务器不可达 / 密钥无效 / 需 force-reauth），抛错不登记
  if (result.exitCode !== 0 && !result.authUrl) {
    const detail = result.errorDetail !== '' ? `：${result.errorDetail}` : '';
    throw AppError.commandFailed('tailscale up', `登录失败${detail}`);
  }

  // 登记账户到注册表（label 默认取 controlUrl 主机名，其次 whoami）
  const whoami = await dao.whoamiTailscale();
  let label = req.label?.trim() ?? '';
  if (label === '') {
    if (req.controlUrl && req.controlUrl.trim() !== '') {
      try {
        label = new URL(req.controlUrl.trim()).host;
      } catch {
        label = req.controlUrl.trim();
      }
    } else {
      label = 'control.tailscale.com';
    }
  }

  const accountId = label.replace(/[^a-zA-Z0-9._-]/g, '_');
  const account: TailscaleAccount = {
    id: accountId,
    label,
    controlUrl: req.controlUrl?.trim() ?? 'https://control.tailscale.com',
    loginName: whoami ?? '',
    active: true,
  };

  // 更新注册表：同 id 覆盖，其余账户取消激活
  const accounts = await dao.loadAccounts();
  const others = accounts
    .filter((a) => a.id !== accountId)
    .map((a) => ({ ...a, active: false }));
  await dao.saveAccounts([...others, account]);

  return {
    backendState: result.backendState,
    authUrl: result.authUrl,
    account,
  };
}

/**
 * 登出当前 Tailscale 账户（注册表保留，仅取消激活标记）
 */
export async function logoutTailscale(): Promise<void> {
  await dao.logoutTailscale();
  const accounts = await dao.loadAccounts();
  await dao.saveAccounts(accounts.map((a) => ({ ...a, active: false })));
}

/**
 * 切换激活账户（重新登录到指定账户的控制平面）
 * @param accountId - 目标账户 id
 */
export async function switchTailscaleAccount(
  accountId: string,
): Promise<TailscaleLoginResponse> {
  const accounts = await dao.loadAccounts();
  const target = accounts.find((a) => a.id === accountId);
  if (!target) {
    throw AppError.notFound(`账户 [${accountId}]`);
  }

  // 复用登录流程切换控制平面（无 authKey 时返回认证 URL）
  return loginTailscale({
    controlUrl: target.controlUrl,
    label: target.label,
  });
}

/**
 * 移除已登记账户（仅从注册表删除，不影响 tailscale 运行状态）
 * @param accountId - 目标账户 id
 */
export async function removeTailscaleAccount(accountId: string): Promise<void> {
  const accounts = await dao.loadAccounts();
  const next = accounts.filter((a) => a.id !== accountId);
  if (next.length === accounts.length) {
    throw AppError.notFound(`账户 [${accountId}]`);
  }
  await dao.saveAccounts(next);
}

/**
 * 应用 Tailscale 偏好设置（exit node / accept routes 等）
 * @param prefs - 偏好设置项
 */
export async function setTailscalePrefs(
  prefs: Partial<TailscalePrefs>,
): Promise<void> {
  // exitNode 若提供需为合法 IP 或空串
  if (prefs.exitNode !== undefined && prefs.exitNode !== '') {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(prefs.exitNode)) {
      throw AppError.badRequest(
        'INVALID_IP',
        `无效的 exit node IP: ${prefs.exitNode}`,
      );
    }
  }
  await dao.setTailscalePrefs(prefs);
}

/**
 * 获取 Tailscale 管理综合报告（状态 + 账户列表 + 偏好）
 */
export async function getTailscaleManageReport(): Promise<TailscaleManageReport> {
  const [report, accounts, prefs] = await Promise.all([
    getTailscaleReport(),
    dao.loadAccounts(),
    dao.getTailscalePrefs(),
  ]);
  return { report, accounts, prefs };
}
