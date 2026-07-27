/**
 * 模块5：用户与权限管理 — 数据访问层
 * 用户来源：/etc/passwd（系统用户）+ NAISys 映射文件（控制台创建的用户）
 * 映射文件位于 /data/naisys/users.json，避免直接修改系统文件
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DATA_ROOT, NAISYS_APP_DIR } from '../../config.js';
import { getDirUsageBytes, pathExists } from '../../system/filesystem.js';

/** NAISys 用户映射文件路径 */
const USER_MAPPING_FILE = path.join(NAISYS_APP_DIR, 'users.json');

/** 普通用户 UID 范围（Debian 约定：1000+，排除 nobody/nfsnobody 65534） */
const MIN_MANAGED_UID = 1000;
const MAX_MANAGED_UID = 59999;

/** 系统保留用户名（即使 UID 在范围内也排除） */
const RESERVED_USERNAMES = new Set(['nobody', 'nfsnobody', 'naisys']);

/**
 * 解析 /etc/passwd 获取用户名映射
 * @returns uid → username 映射
 */
export async function getPasswdUsers(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const content = await fs.readFile('/etc/passwd', 'utf-8');
    for (const line of content.split('\n')) {
      const parts = line.split(':');
      const name = parts[0];
      const uidStr = parts[2];
      if (!name || !uidStr) continue;
      const uid = parseInt(uidStr, 10);
      if (!Number.isNaN(uid)) map.set(uid, name);
    }
  } catch {
    // /etc/passwd 不可读时返回空映射
  }
  return map;
}

/**
 * 读取 NAISys 用户映射文件
 * @returns uid → username 映射
 */
export async function getNaisysUserMappings(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const content = await fs.readFile(USER_MAPPING_FILE, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, string>;
    for (const [uidStr, username] of Object.entries(parsed)) {
      const uid = parseInt(uidStr, 10);
      if (!Number.isNaN(uid) && typeof username === 'string') {
        map.set(uid, username);
      }
    }
  } catch {
    // 文件不存在或损坏时返回空映射
  }
  return map;
}

/**
 * 将用户名映射追加写入 NAISys 映射文件
 * @param uid - 用户 UID
 * @param username - 用户名
 */
export async function saveNaisysUserMapping(
  uid: number,
  username: string,
): Promise<void> {
  const existing = await getNaisysUserMappings();
  existing.set(uid, username);
  const obj: Record<string, string> = {};
  for (const [k, v] of existing) obj[String(k)] = v;
  await fs.mkdir(NAISYS_APP_DIR, { recursive: true });
  await fs.writeFile(
    USER_MAPPING_FILE,
    JSON.stringify(obj, null, 2),
    'utf-8',
  );
}

/**
 * 枚举受管用户 UID 列表（/data 下数字目录 ∪ passwd 普通用户 ∪ 映射文件）
 * @returns 去重排序后的 UID 数组
 */
export async function listManagedUids(): Promise<number[]> {
  const uids = new Set<number>();

  // /data 下的数字目录
  try {
    const entries = await fs.readdir(DATA_ROOT);
    for (const entry of entries) {
      if (/^\d+$/.test(entry)) uids.add(parseInt(entry, 10));
    }
  } catch {
    // DATA_ROOT 不存在时忽略
  }

  // /etc/passwd 普通用户
  for (const [uid, name] of await getPasswdUsers()) {
    if (
      uid >= MIN_MANAGED_UID &&
      uid <= MAX_MANAGED_UID &&
      !RESERVED_USERNAMES.has(name)
    ) {
      uids.add(uid);
    }
  }

  // NAISys 映射文件
  for (const uid of (await getNaisysUserMappings()).keys()) {
    uids.add(uid);
  }

  return [...uids].sort((a, b) => a - b);
}

/**
 * 获取用户数据目录使用量（字节）
 * @param uid - 用户 UID
 * @returns 使用量；目录不存在时返回 0n
 */
export async function getUserUsage(uid: number): Promise<bigint> {
  const dataDir = path.join(DATA_ROOT, String(uid));
  const exists = await pathExists(dataDir);
  if (!exists) return 0n;
  return getDirUsageBytes(dataDir);
}

/**
 * 检查用户名是否已被占用（passwd + 映射文件）
 * @param username - 用户名
 * @returns true=已占用
 */
export async function isUsernameTaken(username: string): Promise<boolean> {
  for (const name of (await getPasswdUsers()).values()) {
    if (name === username) return true;
  }
  for (const name of (await getNaisysUserMappings()).values()) {
    if (name === username) return true;
  }
  return false;
}

/**
 * 检查 UID 是否已被占用（passwd + /data 目录 + 映射文件）
 * @param uid - UID
 * @returns true=已占用
 */
export async function isUidTaken(uid: number): Promise<boolean> {
  if ((await getPasswdUsers()).has(uid)) return true;
  if ((await getNaisysUserMappings()).has(uid)) return true;
  return pathExists(path.join(DATA_ROOT, String(uid)));
}

/**
 * 自动分配下一个可用 UID（/data 下最大 UID + 1，最小 1000）
 * @returns 可用 UID
 */
export async function allocateNextUid(): Promise<number> {
  let maxUid = MIN_MANAGED_UID - 1;
  for (const uid of await listManagedUids()) {
    if (uid > maxUid) maxUid = uid;
  }
  return maxUid + 1;
}
