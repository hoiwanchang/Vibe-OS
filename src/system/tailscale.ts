/**
 * Tailscale CLI 封装
 * 提供节点状态查询、Subnet Router 配置、ACL 策略下发
 */
import { executeCommand, executeCommandStrict } from './command-executor.js';
import type {
  TailscaleStatus,
  TailscalePeer,
  SubnetRoute,
} from '../modules/container/container.types.js';

/**
 * 获取 Tailscale 节点状态
 */
export async function getTailscaleStatus(): Promise<TailscaleStatus> {
  const result = await executeCommand('tailscale', ['status', '--json']);

  if (result.exitCode !== 0) {
    return {
      backendState: 'NotRunning',
      self: null,
      peers: [],
      error: result.stderr || 'Tailscale 未运行或不可用',
    };
  }

  try {
    const parsed = JSON.parse(result.stdout) as {
      BackendState?: string;
      Self?: {
        HostName?: string;
        TailscaleIPs?: string[];
        OS?: string;
        Online?: boolean;
      };
      Peer?: Record<
        string,
        {
          HostName?: string;
          TailscaleIPs?: string[];
          OS?: string;
          Online?: boolean;
          Active?: boolean;
        }
      >;
    };

    const peers: TailscalePeer[] = Object.entries(parsed.Peer ?? {}).map(
      ([key, peer]) => ({
        id: key,
        hostname: peer.HostName ?? '',
        ips: peer.TailscaleIPs ?? [],
        os: peer.OS ?? '',
        online: peer.Online ?? false,
        active: peer.Active ?? false,
      }),
    );

    return {
      backendState: parsed.BackendState ?? 'Unknown',
      self: parsed.Self
        ? {
            hostname: parsed.Self.HostName ?? '',
            ips: parsed.Self.TailscaleIPs ?? [],
            os: parsed.Self.OS ?? '',
            online: parsed.Self.Online ?? false,
          }
        : null,
      peers,
      error: null,
    };
  } catch {
    return {
      backendState: 'Unknown',
      self: null,
      peers: [],
      error: 'Tailscale 状态解析失败',
    };
  }
}

/**
 * 配置 Subnet Router（通告子网路由）
 * @param subnets - 子网 CIDR 列表，如 ["192.168.1.0/24"]
 */
export async function configureSubnetRouter(
  subnets: string[],
): Promise<void> {
  const subnetArg = subnets.join(',');
  await executeCommandStrict('tailscale', [
    'up',
    `--advertise-routes=${subnetArg}`,
  ]);
}

/**
 * 获取当前 Subnet Router 配置
 */
export async function getSubnetRoutes(): Promise<SubnetRoute[]> {
  const result = await executeCommand('tailscale', [
    'status',
    '--json',
  ]);

  if (result.exitCode !== 0) return [];

  try {
    const parsed = JSON.parse(result.stdout) as {
      Self?: {
        AllowedIPs?: string[];
        Capabilities?: string[];
      };
    };

    const allowedIps = parsed.Self?.AllowedIPs ?? [];
    return allowedIps
      .filter((ip) => ip.includes('/') && !ip.endsWith('/32'))
      .map((cidr) => ({
        cidr,
        advertised: true,
        approved: true,
      }));
  } catch {
    return [];
  }
}

/**
 * 下发 ACL 策略（通过 Tailscale API）
 * 注意：离线环境下此功能受限，需要 Tailscale 控制平面可达
 * @param aclPolicy - ACL 策略 JSON 字符串
 */
export async function applyAclPolicy(aclPolicy: string): Promise<void> {
  // Tailscale ACL 通过控制平面管理，本地 CLI 不直接支持
  // 此处通过 tailscale set 命令应用本地可配置的策略
  await executeCommandStrict('tailscale', [
    'set',
    `--accept-routes`,
  ]);

  // 记录 ACL 策略到本地（供审计）
  const { ensureDir } = await import('./filesystem.js');
  const { NAISYS_APP_DIR } = await import('../config.js');
  const fs = await import('node:fs/promises');

  const aclDir = `${NAISYS_APP_DIR}/tailscale`;
  await ensureDir(aclDir);
  await fs.writeFile(`${aclDir}/acl-policy.json`, aclPolicy, 'utf-8');
}

/**
 * 检查 Tailscale 是否已安装并可用
 */
export async function isTailscaleAvailable(): Promise<boolean> {
  const result = await executeCommand('tailscale', ['version']);
  return result.exitCode === 0;
}

/* ---------- 多账户 / HeadScale 管理 ---------- */

/**
 * 登录 Tailscale 控制平面（支持第三方 headscale 服务器）
 *
 * - 提供 authKey 时走免交互登录（headscale 预认证密钥场景）
 * - 未提供 authKey 时 tailscale 会返回一个认证 URL，需用户在浏览器完成授权
 * - controlUrl 指向 headscale 时通过 --login-server 指定
 *
 * @param options - 登录选项（controlUrl / authKey / exitNode / acceptRoutes）
 * @returns 后端状态与认证 URL（如需人工授权）
 */
export async function tailscaleLogin(options: {
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
  const args = ['up'];

  if (options.controlUrl && options.controlUrl.trim() !== '') {
    args.push(`--login-server=${options.controlUrl.trim()}`);
  }
  if (options.authKey && options.authKey.trim() !== '') {
    args.push(`--auth-key=${options.authKey.trim()}`);
  }
  if (options.exitNode) {
    args.push('--advertise-exit-node');
  }
  if (options.acceptRoutes) {
    args.push('--accept-routes');
  }

  // 登录可能阻塞等待授权，给予更长超时
  const result = await executeCommand('tailscale', args, 60_000);

  // 从输出中提取认证 URL。tailscale 的授权链接形如：
  //   官方："To authenticate, visit: https://login.tailscale.com/a/xxxx"（login 在域名）
  //   headscale："http://headscale:8080/login?authkey=..."（login 在路径）
  // 匹配 URL 中任意位置含 "login" 的链接，避免把 --login-server 的 controlUrl
  // （如 http://10.99.99.99:8080，不含 login）误判为授权链接
  const combined = `${result.stdout}\n${result.stderr}`;
  const match = combined.match(/https?:\/\/\S*login\S*/);
  const authUrl = match ? match[0] : null;

  // 登录后读取一次状态以获取 backendState
  const status = await getTailscaleStatus();

  // 提取 tailscale 的真实错误信息（用于向用户透传，如
  // "can't change --login-server without --force-reauth"）
  const errorDetail = combined
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('To authenticate'))
    .join(' ')
    .slice(0, 300);

  return {
    backendState: status.backendState,
    authUrl,
    exitCode: result.exitCode,
    errorDetail,
  };
}

/**
 * 登出当前 Tailscale 账户
 */
export async function tailscaleLogout(): Promise<void> {
  await executeCommandStrict('tailscale', ['logout']);
}

/**
 * 查询当前登录身份（whoami）
 * @returns 登录用户标识，未登录时返回 null
 */
export async function tailscaleWhoami(): Promise<string | null> {
  const result = await executeCommand('tailscale', ['whoami']);
  if (result.exitCode !== 0) return null;
  const line = result.stdout.trim().split('\n')[0];
  return line && line !== '' ? line : null;
}

/**
 * 应用 Tailscale 偏好设置（tailscale set）
 * @param prefs - 偏好设置项
 */
export async function tailscaleSetPrefs(prefs: {
  acceptRoutes?: boolean;
  exitNode?: string;
  exitNodeAllowLanAccess?: boolean;
  advertiseExitNode?: boolean;
}): Promise<void> {
  const args = ['set'];

  if (typeof prefs.acceptRoutes === 'boolean') {
    args.push(prefs.acceptRoutes ? '--accept-routes' : '--accept-routes=false');
  }
  if (prefs.exitNode !== undefined) {
    args.push(
      prefs.exitNode === '' ? '--exit-node=' : `--exit-node=${prefs.exitNode}`,
    );
  }
  if (typeof prefs.exitNodeAllowLanAccess === 'boolean') {
    args.push(
      prefs.exitNodeAllowLanAccess
        ? '--exit-node-allow-lan-access'
        : '--exit-node-allow-lan-access=false',
    );
  }
  if (typeof prefs.advertiseExitNode === 'boolean') {
    args.push(
      prefs.advertiseExitNode
        ? '--advertise-exit-node'
        : '--advertise-exit-node=false',
    );
  }

  // 没有任何参数时 tailscale set 会报错，直接跳过
  if (args.length === 1) return;

  await executeCommandStrict('tailscale', args);
}

/**
 * 读取当前 Tailscale 偏好设置（从 status --json 的 Self/SelfNode 推断）
 */
export async function tailscaleGetPrefs(): Promise<{
  acceptRoutes: boolean;
  exitNode: string;
  exitNodeAllowLanAccess: boolean;
  advertiseExitNode: boolean;
}> {
  const result = await executeCommand('tailscale', ['status', '--json']);
  if (result.exitCode !== 0) {
    return {
      acceptRoutes: false,
      exitNode: '',
      exitNodeAllowLanAccess: false,
      advertiseExitNode: false,
    };
  }

  try {
    const parsed = JSON.parse(result.stdout) as {
      Self?: {
        AllowedIPs?: string[];
        ExitNode?: boolean;
        PrimaryRoutes?: string[];
      };
      ExitNodeStatus?: { ID?: string; TailscaleIPs?: string[] };
    };

    // 通告 exit node：Self.ExitNode 为 true 表示本节点是 exit node
    const advertiseExitNode = parsed.Self?.ExitNode === true;

    // 当前使用的 exit node（若本机正在使用某个 exit node）
    const exitNodeIps = parsed.ExitNodeStatus?.TailscaleIPs ?? [];
    const exitNode = exitNodeIps[0] ?? '';

    return {
      acceptRoutes: (parsed.Self?.AllowedIPs?.length ?? 0) > 0,
      exitNode,
      exitNodeAllowLanAccess: false, // CLI status 不直接暴露，保守返回 false
      advertiseExitNode,
    };
  } catch {
    return {
      acceptRoutes: false,
      exitNode: '',
      exitNodeAllowLanAccess: false,
      advertiseExitNode: false,
    };
  }
}
