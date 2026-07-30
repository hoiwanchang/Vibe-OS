/**
 * 模块3：Docker 与 Tailscale 服务编排 — 数据访问层
 * 封装 Docker CLI 和 Tailscale CLI 的底层调用
 */
import * as path from 'node:path';
import { APP_SUBDIRS, VIBEOS_APP_DIR } from '../../config.js';
import {
  assertSafePath,
  ensureDir,
  pathExists,
} from '../../system/filesystem.js';
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
  tailscaleLogin,
  tailscaleLogout,
  tailscaleWhoami,
  tailscaleSetPrefs,
  tailscaleGetPrefs,
} from '../../system/tailscale.js';
import type {
  ContainerDeployRequest,
  ContainerInfo,
  ContainerLogResult,
  TailscaleStatus,
  SubnetRoute,
  TailscaleAccount,
  TailscalePrefs,
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

/**
 * 登录 Tailscale（支持 headscale 第三方控制平面）
 */
export async function loginTailscale(options: {
  controlUrl?: string;
  authKey?: string;
  exitNode?: boolean;
  acceptRoutes?: boolean;
}): Promise<{
  backendState: string;
  authUrl: string | null;
  exitCode: number;
  errorDetail: string;
}> {
  return tailscaleLogin(options);
}

/**
 * 登出 Tailscale
 */
export async function logoutTailscale(): Promise<void> {
  return tailscaleLogout();
}

/**
 * 查询当前登录身份
 */
export async function whoamiTailscale(): Promise<string | null> {
  return tailscaleWhoami();
}

/**
 * 应用 Tailscale 偏好设置
 */
export async function setTailscalePrefs(
  prefs: Partial<TailscalePrefs>,
): Promise<void> {
  return tailscaleSetPrefs(prefs);
}

/**
 * 读取 Tailscale 偏好设置
 */
export async function getTailscalePrefs(): Promise<TailscalePrefs> {
  return tailscaleGetPrefs();
}

/* ---------- 账户注册表持久化（多账户管理） ---------- */

/** 账户注册表文件路径 /data/vibeos/tailscale/accounts.json */
const ACCOUNTS_FILE = `${VIBEOS_APP_DIR}/tailscale/accounts.json`;

/**
 * 读取已配置的 Tailscale 账户列表
 * 文件不存在时返回空数组
 */
export async function loadAccounts(): Promise<TailscaleAccount[]> {
  const fs = await import('node:fs/promises');
  try {
    const raw = await fs.readFile(ACCOUNTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as { accounts?: TailscaleAccount[] };
    return Array.isArray(parsed.accounts) ? parsed.accounts : [];
  } catch {
    return [];
  }
}

/**
 * 保存 Tailscale 账户列表（覆盖写入）
 * @param accounts - 账户数组
 */
export async function saveAccounts(accounts: TailscaleAccount[]): Promise<void> {
  const { ensureDir } = await import('../../system/filesystem.js');
  const fs = await import('node:fs/promises');
  await ensureDir(path.dirname(ACCOUNTS_FILE));
  await fs.writeFile(
    ACCOUNTS_FILE,
    JSON.stringify({ accounts }, null, 2),
    'utf-8',
  );
}

/**
 * 创建 AI 应用标准目录结构 /data/vibeos/{appname}/{models,data,logs}
 * @param appname - 应用名（调用方已完成合法性校验）
 * @returns 应用根目录与新创建的目录列表
 */
export async function createAppDirs(appname: string): Promise<{
  appDir: string;
  createdDirs: string[];
}> {
  const appDir = assertSafePath(path.join(VIBEOS_APP_DIR, appname));
  const createdDirs: string[] = [];

  if (!(await pathExists(appDir))) {
    await ensureDir(appDir, 0o755);
    createdDirs.push(appDir);
  }

  for (const subdir of APP_SUBDIRS) {
    const subPath = path.join(appDir, subdir);
    if (!(await pathExists(subPath))) {
      await ensureDir(subPath, 0o755);
      createdDirs.push(subPath);
    }
  }

  return { appDir, createdDirs };
}
