/**
 * 模块1：系统初始化 — 业务逻辑层
 * 编排数据目录初始化、用户配额管理
 */
import {
  DATA_ROOT,
  NAISYS_APP_DIR,
  SECRETS_DIR,
  SYSTEM_CACHE_DIR,
  DEFAULT_QUOTA_BYTES,
} from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { getQuotaInfo, setUserQuota } from '../../system/filesystem.js';
import * as dao from './system-init.dao.js';
import type {
  InitDataRequest,
  InitDataResult,
  UserQuotaInfo,
} from './system-init.types.js';

/**
 * 执行数据目录初始化
 * 创建 /data/ 完整目录结构并校验权限
 * @param req - 初始化请求参数
 * @returns 初始化结果
 */
export async function initializeDataDirs(
  _req: InitDataRequest,
): Promise<InitDataResult> {
  const createdDirs: string[] = [];
  const existingDirs: string[] = [];

  // 1. 创建核心目录
  const coreDirs: Array<{ path: string; mode: number }> = [
    { path: DATA_ROOT, mode: 0o755 },
    { path: NAISYS_APP_DIR, mode: 0o755 },
    { path: SECRETS_DIR, mode: 0o700 },
    { path: SYSTEM_CACHE_DIR, mode: 0o755 },
  ];

  for (const dir of coreDirs) {
    const isNew = await dao.createDirIfNotExists(dir.path, dir.mode);
    if (isNew) {
      createdDirs.push(dir.path);
    } else {
      existingDirs.push(dir.path);
    }
  }

  // 2. 权限校验
  const permissionCheck = await dao.checkPermissions();

  // 3. 安全警告：不应以 root 运行
  if (permissionCheck.isRoot) {
    throw AppError.forbidden(
      'NAISys 服务禁止以 root 身份运行，请使用 naisys 用户',
    );
  }

  return {
    dataRoot: DATA_ROOT,
    createdDirs,
    existingDirs,
    permissionCheck,
    success: true,
  };
}

/**
 * 初始化用户数据目录并设置配额
 * @param uid - 用户 UID
 * @param quotaBytes - 配额（字节），默认使用全局配置
 * @returns 用户配额信息
 */
export async function initUserSpace(
  uid: number,
  quotaBytes?: bigint,
): Promise<UserQuotaInfo> {
  // 校验用户存在
  const mapping = await dao.getUserMapping(uid);
  if (!mapping) {
    throw AppError.notFound(`UID ${uid} 对应的系统用户`);
  }

  // 创建用户目录
  await dao.createUserDirs(uid);

  // 设置配额
  const quota = quotaBytes ?? DEFAULT_QUOTA_BYTES;
  try {
    await setUserQuota(uid, quota);
  } catch {
    // 配额设置失败不阻塞初始化（可能文件系统不支持 quota）
  }

  return getUserQuota(uid);
}

/**
 * 获取用户配额与使用量信息
 * @param uid - 用户 UID
 * @returns 配额详情
 */
export async function getUserQuota(uid: number): Promise<UserQuotaInfo> {
  const mapping = await dao.getUserMapping(uid);
  if (!mapping) {
    throw AppError.notFound(`UID ${uid} 对应的系统用户`);
  }

  if (!mapping.dirExists) {
    throw AppError.notFound(`UID ${uid} 的数据目录`);
  }

  // 获取各子目录使用量
  const subdirUsage = await dao.getUserDirUsage(uid);
  const totalUsed = subdirUsage.reduce((sum, s) => sum + s.usedBytes, 0n);

  // 获取配额信息
  const quotaInfo = await getQuotaInfo(uid);
  const quotaBytes = quotaInfo?.quotaBytes ?? DEFAULT_QUOTA_BYTES;

  const usagePercent =
    quotaBytes > 0n
      ? Number((totalUsed * 10000n) / quotaBytes) / 100
      : 0;

  return {
    uid,
    dataDir: mapping.dataDir,
    usedBytes: totalUsed.toString(),
    quotaBytes: quotaBytes.toString(),
    usagePercent,
    subdirs: subdirUsage.map((s) => ({
      name: s.name,
      usedBytes: s.usedBytes.toString(),
    })),
  };
}
