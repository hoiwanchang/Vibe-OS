/**
 * 模块：共享文件夹 — 业务逻辑层
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DATA_ROOT, NAISYS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import type { ShareInfo, ShareConnection } from './sharing.types.js';

const SHARES_CONFIG = `${NAISYS_APP_DIR}/sharing/shares.json`;

/** 读取共享配置 */
async function loadShares(): Promise<ShareInfo[]> {
  try {
    const raw = await fs.readFile(SHARES_CONFIG, 'utf-8');
    return JSON.parse(raw) as ShareInfo[];
  } catch {
    return [];
  }
}

/** 保存共享配置 */
async function saveShares(shares: ShareInfo[]): Promise<void> {
  await fs.mkdir(path.dirname(SHARES_CONFIG), { recursive: true });
  await fs.writeFile(SHARES_CONFIG, JSON.stringify(shares, null, 2), 'utf-8');
}

/** 校验共享路径在 /data/ 内 */
function assertSharePath(sharePath: string): void {
  const resolved = path.resolve(sharePath);
  const dataRoot = path.resolve(DATA_ROOT);
  if (!resolved.startsWith(dataRoot + path.sep) && resolved !== dataRoot) {
    throw AppError.forbidden('共享路径必须在 /data/ 下');
  }
}

/** 列出所有共享 */
export async function listShares(): Promise<ShareInfo[]> {
  return loadShares();
}

/** 创建共享 */
export async function createShare(share: Omit<ShareInfo, 'enabled'>): Promise<ShareInfo> {
  assertSharePath(share.path);
  const shares = await loadShares();
  if (shares.find((s) => s.name === share.name)) {
    throw AppError.conflict(`共享 [${share.name}] 已存在`);
  }
  const newShare: ShareInfo = { ...share, enabled: true };
  shares.push(newShare);
  await saveShares(shares);

  // 根据协议重启服务
  if (share.protocol === 'smb') {
    await executeCommand('smbcontrol', ['smbd', 'reload-config']);
  } else if (share.protocol === 'nfs') {
    await executeCommand('exportfs', ['-ra']);
  }
  return newShare;
}

/** 修改共享 */
export async function updateShare(name: string, updates: Partial<ShareInfo>): Promise<ShareInfo> {
  const shares = await loadShares();
  const idx = shares.findIndex((s) => s.name === name);
  if (idx === -1) throw AppError.notFound(`共享 [${name}]`);

  const existing = shares[idx];
  if (!existing) throw AppError.notFound(`共享 [${name}]`);
  if (updates.path) assertSharePath(updates.path);
  const updated: ShareInfo = {
    ...existing,
    path: updates.path ?? existing.path,
    readonly: updates.readonly ?? existing.readonly,
    validUsers: updates.validUsers ?? existing.validUsers,
    hosts: updates.hosts ?? existing.hosts,
    enabled: updates.enabled ?? existing.enabled,
    port: updates.port ?? existing.port,
    name,
  };
  shares[idx] = updated;
  await saveShares(shares);

  if (updated.protocol === 'smb') {
    await executeCommand('smbcontrol', ['smbd', 'reload-config']);
  } else if (updated.protocol === 'nfs') {
    await executeCommand('exportfs', ['-ra']);
  }
  return updated;
}

/** 删除共享 */
export async function removeShare(name: string): Promise<string> {
  const shares = await loadShares();
  const idx = shares.findIndex((s) => s.name === name);
  if (idx === -1) throw AppError.notFound(`共享 [${name}]`);

  const protocol = shares[idx]?.protocol;
  shares.splice(idx, 1);
  await saveShares(shares);

  if (protocol === 'smb') {
    await executeCommand('smbcontrol', ['smbd', 'reload-config']);
  } else if (protocol === 'nfs') {
    await executeCommand('exportfs', ['-ra']);
  }
  return name;
}

/** 获取共享连接状态 */
export async function getShareStatus(name: string): Promise<ShareConnection[]> {
  const shares = await loadShares();
  const share = shares.find((s) => s.name === name);
  if (!share) throw AppError.notFound(`共享 [${name}]`);

  if (share.protocol === 'smb') {
    const result = await executeCommand('smbstatus', ['--shares', '--brief']);
    if (result.exitCode !== 0) return [];
    const connections: ShareConnection[] = [];
    const lines = result.stdout.trim().split('\n').slice(3);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4 && line.includes(name)) {
        connections.push({ user: parts[1] ?? '', host: parts[3] ?? '', openedAt: '', files: 0 });
      }
    }
    return connections;
  }
  return [];
}

/** 重启共享服务 */
export async function restartShare(name: string): Promise<{ restarted: string; pid: number }> {
  const shares = await loadShares();
  const share = shares.find((s) => s.name === name);
  if (!share) throw AppError.notFound(`共享 [${name}]`);

  const serviceMap: Record<string, string> = { smb: 'smbd', nfs: 'nfs-server', webdav: 'naisys-webdav' };
  const svc = serviceMap[share.protocol] ?? 'smbd';
  await executeCommandStrict('systemctl', ['restart', svc]);
  return { restarted: name, pid: 0 };
}
