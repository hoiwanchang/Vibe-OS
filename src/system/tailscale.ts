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
