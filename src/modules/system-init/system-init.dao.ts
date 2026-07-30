/**
 * 模块1：系统初始化 — 数据访问层
 * 负责与文件系统、系统命令交互的底层操作
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  DATA_ROOT,
  VIBEOS_APP_DIR,
  SECRETS_DIR,
  SYSTEM_CACHE_DIR,
  USER_SUBDIRS,
} from '../../config.js';
import { assertSafePath, ensureDir, pathExists } from '../../system/filesystem.js';
import { executeCommand } from '../../system/command-executor.js';
import type { PermissionCheckResult, UserMapping } from './system-init.types.js';

/**
 * 获取需要创建的完整目录列表
 * @returns 所有必须存在的目录路径
 */
export function getRequiredDirs(): string[] {
  const dirs: string[] = [
    DATA_ROOT,
    VIBEOS_APP_DIR,
    SECRETS_DIR,
    SYSTEM_CACHE_DIR,
  ];
  return dirs;
}

/**
 * 创建单个目录并返回是否为新创建
 * @param dirPath - 目录路径
 * @param mode - 权限模式
 * @returns true=新创建, false=已存在
 */
export async function createDirIfNotExists(
  dirPath: string,
  mode = 0o755,
): Promise<boolean> {
  const exists = await pathExists(dirPath);
  if (exists) return false;
  await ensureDir(dirPath, mode);
  return true;
}

/**
 * 校验关键目录权限
 */
export async function checkPermissions(): Promise<PermissionCheckResult> {
  // 检查数据根目录可写性
  let dataRootWritable = false;
  try {
    await fs.access(DATA_ROOT, fs.constants.W_OK);
    dataRootWritable = true;
  } catch {
    dataRootWritable = false;
  }

  // 检查 secrets 目录权限
  let secretsDirSecure = false;
  try {
    const stat = await fs.stat(SECRETS_DIR);
    // 权限应为 0700 (rwx------)
    secretsDirSecure = (stat.mode & 0o777) === 0o700;
  } catch {
    secretsDirSecure = false;
  }

  // 获取当前用户信息
  const idResult = await executeCommand('id', ['-un']);
  const currentUser = idResult.stdout.trim() || 'unknown';
  const isRoot = process.getuid?.() === 0;

  return {
    dataRootWritable,
    secretsDirSecure,
    currentUser,
    isRoot,
  };
}

/**
 * 创建用户数据目录结构
 * @param uid - 用户 UID
 * @returns 新创建的目录列表
 */
export async function createUserDirs(uid: number): Promise<string[]> {
  const userRoot = path.join(DATA_ROOT, String(uid));
  assertSafePath(userRoot);

  const created: string[] = [];

  const isNew = await createDirIfNotExists(userRoot, 0o700);
  if (isNew) created.push(userRoot);

  for (const subdir of USER_SUBDIRS) {
    const dirPath = path.join(userRoot, subdir);
    const subCreated = await createDirIfNotExists(dirPath, 0o755);
    if (subCreated) created.push(dirPath);
  }

  return created;
}

/**
 * 查询系统用户信息
 * @param uid - 用户 UID
 * @returns 用户映射信息
 */
export async function getUserMapping(uid: number): Promise<UserMapping | null> {
  const result = await executeCommand('getent', ['passwd', String(uid)]);
  if (result.exitCode !== 0) return null;

  const parts = result.stdout.trim().split(':');
  const username = parts[0] ?? '';
  const dataDir = path.join(DATA_ROOT, String(uid));
  const dirExists = await pathExists(dataDir);

  return { uid, username, dataDir, dirExists };
}

/**
 * 获取用户数据目录使用量
 * @param uid - 用户 UID
 * @returns 各子目录使用量（字节）
 */
export async function getUserDirUsage(
  uid: number,
): Promise<Array<{ name: string; usedBytes: bigint }>> {
  const userRoot = path.join(DATA_ROOT, String(uid));
  const { getDirUsageBytes } = await import('../../system/filesystem.js');
  const results: Array<{ name: string; usedBytes: bigint }> = [];

  for (const subdir of USER_SUBDIRS) {
    const dirPath = path.join(userRoot, subdir);
    const exists = await pathExists(dirPath);
    if (exists) {
      const bytes = await getDirUsageBytes(dirPath);
      results.push({ name: subdir, usedBytes: bytes });
    } else {
      results.push({ name: subdir, usedBytes: 0n });
    }
  }

  return results;
}
