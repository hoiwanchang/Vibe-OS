/**
 * 文件系统操作封装
 * 所有路径操作限定在 DATA_ROOT 内，强制路径穿越防护
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DATA_ROOT } from '../config.js';
import { AppError } from '../common/app-error.js';

/**
 * 校验路径是否在 DATA_ROOT 内（防路径穿越）
 * @param targetPath - 待校验路径
 * @returns 规范化后的绝对路径
 * @throws AppError 路径穿越检测
 */
export function assertSafePath(targetPath: string): string {
  const normalized = path.resolve(targetPath);
  const dataRoot = path.resolve(DATA_ROOT);

  if (!normalized.startsWith(dataRoot + path.sep) && normalized !== dataRoot) {
    throw AppError.forbidden(
      `路径穿越检测: [${targetPath}] 不在数据根目录 [${DATA_ROOT}] 内`,
    );
  }
  return normalized;
}

/**
 * 递归创建目录（含权限设置）
 * @param dirPath - 目录路径（必须在 DATA_ROOT 内）
 * @param mode - 权限模式（八进制）
 */
export async function ensureDir(dirPath: string, mode = 0o755): Promise<void> {
  const safePath = assertSafePath(dirPath);
  await fs.mkdir(safePath, { recursive: true, mode });
}

/**
 * 检查路径是否存在
 */
export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取目录磁盘使用量（字节）
 * 通过 du 命令实现，避免递归遍历大目录
 */
export async function getDirUsageBytes(dirPath: string): Promise<bigint> {
  const safePath = assertSafePath(dirPath);
  const { executeCommand } = await import('./command-executor.js');
  const result = await executeCommand('du', ['-sb', safePath]);

  if (result.exitCode !== 0) {
    // 目录可能不存在
    return 0n;
  }

  const bytes = result.stdout.split('\t')[0];
  return BigInt(bytes ?? '0');
}

/**
 * 获取文件系统配额信息
 * @param uid - 用户 UID
 * @returns 配额信息（字节）
 */
export async function getQuotaInfo(uid: number): Promise<{
  usedBytes: bigint;
  quotaBytes: bigint;
} | null> {
  const { executeCommand } = await import('./command-executor.js');
  const result = await executeCommand('quota', [
    '-u',
    String(uid),
    '--show-mntpoint',
    '-w',
  ]);

  if (result.exitCode !== 0) {
    return null;
  }

  // 解析 quota 输出
  const lines = result.stdout.trim().split('\n');
  for (const line of lines) {
    if (line.includes('/data')) {
      const parts = line.trim().split(/\s+/);
      // quota 输出格式: device used quota ...
      const usedKb = parts[1];
      const quotaKb = parts[2];
      if (usedKb && quotaKb) {
        return {
          usedBytes: BigInt(usedKb) * 1024n,
          quotaBytes: BigInt(quotaKb) * 1024n,
        };
      }
    }
  }
  return null;
}

/**
 * 设置用户磁盘配额
 * @param uid - 用户 UID
 * @param quotaBytes - 配额（字节）
 */
export async function setUserQuota(
  uid: number,
  quotaBytes: bigint,
): Promise<void> {
  const { executeCommandStrict } = await import('./command-executor.js');
  const quotaKb = quotaBytes / 1024n;
  await executeCommandStrict('setquota', [
    '-u',
    String(uid),
    '0',
    String(quotaKb),
    '0',
    '0',
    DATA_ROOT,
  ]);
}
