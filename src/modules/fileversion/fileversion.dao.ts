/**
 * 模块：文件版本控制 — 数据访问层
 * 负责版本元数据（meta.json）与版本策略（fileversion-policy.json）的持久化
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import type { VersionEntry, VersionPolicyConfig } from './fileversion.types.js';

/** 版本策略配置文件路径 */
const POLICY_FILE = path.join(VIBEOS_APP_DIR, 'settings', 'fileversion-policy.json');

/** 版本元数据结构 */
export interface VersionMeta {
  /** 版本条目列表（按版本号升序） */
  versions: VersionEntry[];
}

/**
 * 计算某文件的版本存储目录
 * 结构：VIBEOS_APP_DIR/versions/{uid}/{urlencoded(相对路径)}/
 * @param uid - 用户 UID
 * @param relativePath - 原始文件相对路径
 * @returns 版本目录绝对路径
 */
export function getVersionDir(uid: number, relativePath: string): string {
  return path.join(
    VIBEOS_APP_DIR,
    'versions',
    String(uid),
    encodeURIComponent(relativePath),
  );
}

/**
 * 读取某文件的版本元数据
 * 文件不存在或损坏时返回空列表
 * @param uid - 用户 UID
 * @param relativePath - 原始文件相对路径
 * @returns 版本元数据
 */
export async function loadMeta(uid: number, relativePath: string): Promise<VersionMeta> {
  const metaFile = path.join(getVersionDir(uid, relativePath), 'meta.json');
  try {
    const raw = await fs.readFile(metaFile, 'utf-8');
    const parsed = JSON.parse(raw) as VersionMeta;
    return { versions: Array.isArray(parsed.versions) ? parsed.versions : [] };
  } catch {
    return { versions: [] };
  }
}

/**
 * 写入某文件的版本元数据（覆盖写入）
 * @param uid - 用户 UID
 * @param relativePath - 原始文件相对路径
 * @param meta - 版本元数据
 */
export async function saveMeta(uid: number, relativePath: string, meta: VersionMeta): Promise<void> {
  const dir = getVersionDir(uid, relativePath);
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * 读取全部版本策略（按 share 名索引）
 * 文件不存在或损坏时返回空对象
 * @returns 策略映射表
 */
export async function loadPolicies(): Promise<Record<string, VersionPolicyConfig>> {
  try {
    const raw = await fs.readFile(POLICY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, VersionPolicyConfig>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 写入全部版本策略（覆盖写入）
 * @param policies - 策略映射表
 */
export async function savePolicies(policies: Record<string, VersionPolicyConfig>): Promise<void> {
  await ensureDir(path.dirname(POLICY_FILE));
  await fs.writeFile(POLICY_FILE, JSON.stringify(policies, null, 2), 'utf-8');
}
