/**
 * 模块5：用户与权限管理 — 业务逻辑层
 * 用户创建仅建立 /data/{uid}/ 数据空间（不修改系统账户），
 * 用户名映射持久化于 /data/vibeos/users.json
 */
import * as path from 'node:path';
import { DATA_ROOT, DEFAULT_QUOTA_BYTES } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import {
  getQuotaInfo,
  pathExists,
  setUserQuota,
} from '../../system/filesystem.js';
import { createUserDirs } from '../system-init/system-init.dao.js';
import * as dao from './user.dao.js';
import type {
  CreateUserRequest,
  CreateUserResponse,
  ManagedUser,
  UserListResponse,
} from './user.types.js';

/** 用户名合法性：小写字母/下划线开头，仅含小写字母/数字/下划线/连字符，≤32 字符 */
const USERNAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;

/**
 * 获取受管用户列表（含配额与使用量）
 * @returns 用户列表响应
 */
export async function listManagedUsers(): Promise<UserListResponse> {
  const uids = await dao.listManagedUids();
  const passwdUsers = await dao.getPasswdUsers();
  const vibeosUsers = await dao.getNaisysUserMappings();

  const users: ManagedUser[] = [];
  for (const uid of uids) {
    const dataDir = path.join(DATA_ROOT, String(uid));
    const dirExists = await pathExists(dataDir);
    const username =
      passwdUsers.get(uid) ?? vibeosUsers.get(uid) ?? String(uid);
    const usedBytes = await dao.getUserUsage(uid);

    // 配额：优先读取文件系统配额，失败时回退默认值
    const quotaInfo = await getQuotaInfo(uid);
    const quotaBytes = quotaInfo?.quotaBytes ?? DEFAULT_QUOTA_BYTES;
    const usagePercent =
      quotaBytes > 0n
        ? Number((usedBytes * 10000n) / quotaBytes) / 100
        : 0;

    users.push({
      uid,
      username,
      dataDir,
      dirExists,
      usedBytes: usedBytes.toString(),
      quotaBytes: quotaBytes.toString(),
      usagePercent,
    });
  }

  return {
    timestamp: new Date().toISOString(),
    count: users.length,
    users,
  };
}

/**
 * 创建用户数据空间
 * 校验用户名/UID 唯一性后创建 /data/{uid}/ 目录并设置配额
 * @param req - 创建请求
 * @returns 创建结果
 * @throws AppError 用户名非法/已占用、UID 已占用
 */
export async function createUser(
  req: CreateUserRequest,
): Promise<CreateUserResponse> {
  const username = req.username.trim();
  if (!USERNAME_PATTERN.test(username)) {
    throw AppError.badRequest(
      'INVALID_USERNAME',
      '用户名须以小写字母或下划线开头，仅含小写字母、数字、下划线、连字符，长度 ≤ 32',
    );
  }

  if (await dao.isUsernameTaken(username)) {
    throw AppError.conflict(`用户名 [${username}] 已被占用`);
  }

  // 确定 UID：指定则校验唯一性，否则自动分配
  let uid: number;
  if (req.uid !== undefined) {
    if (!Number.isInteger(req.uid) || req.uid < 1000 || req.uid > 59999) {
      throw AppError.badRequest(
        'INVALID_UID',
        'UID 必须为 1000-59999 之间的整数',
      );
    }
    if (await dao.isUidTaken(req.uid)) {
      throw AppError.conflict(`UID [${req.uid}] 已被占用`);
    }
    uid = req.uid;
  } else {
    uid = await dao.allocateNextUid();
  }

  // 创建目录结构（复用系统初始化模块，含路径穿越防护）
  const createdDirs = await createUserDirs(uid);

  // 写入用户名映射
  await dao.saveNaisysUserMapping(uid, username);

  // 设置配额（失败不阻塞，文件系统可能不支持）
  const quotaBytes =
    req.quotaBytes !== undefined
      ? BigInt(req.quotaBytes)
      : DEFAULT_QUOTA_BYTES;
  let quotaSet = false;
  try {
    await setUserQuota(uid, quotaBytes);
    quotaSet = true;
  } catch {
    quotaSet = false;
  }

  return {
    uid,
    username,
    dataDir: path.join(DATA_ROOT, String(uid)),
    createdDirs,
    quotaSet,
  };
}
