/**
 * 模块：文件版本控制 — 业务逻辑层
 * 提供文件版本快照的保存、列举、恢复、删除与策略管理
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DATA_ROOT } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import * as dao from './fileversion.dao.js';
import {
  DEFAULT_POLICY,
  type VersionDeleteResult,
  type VersionEntry,
  type VersionListResult,
  type VersionPolicyConfig,
  type VersionPolicyMode,
  type VersionRestoreResult,
} from './fileversion.types.js';

/**
 * 解析并校验用户空间内的相对路径（防路径穿越）
 * @param uid - 用户 UID
 * @param relativePath - 相对于 /data/{uid}/ 的路径
 * @returns 绝对路径
 */
export function resolveUserPath(uid: number, relativePath: string): string {
  const userRoot = path.join(DATA_ROOT, String(uid));
  const resolved = path.resolve(userRoot, relativePath);
  if (!resolved.startsWith(userRoot + path.sep) && resolved !== userRoot) {
    throw AppError.forbidden(`路径穿越检测: 路径不在 /data/${uid}/ 内`);
  }
  return resolved;
}

/**
 * 获取某文件的当前生效版本策略
 * 未配置时返回默认策略（multiversion）
 * @param share - 共享名（策略索引键）
 * @returns 版本策略配置
 */
export async function getPolicy(share: string): Promise<VersionPolicyConfig> {
  const policies = await dao.loadPolicies();
  return policies[share] ?? { ...DEFAULT_POLICY };
}

/**
 * 设置某共享的版本策略（合并更新）
 * @param share - 共享名
 * @param patch - 待更新的策略字段
 * @returns 更新后的完整策略
 */
export async function setPolicy(
  share: string,
  patch: Partial<VersionPolicyConfig>,
): Promise<VersionPolicyConfig> {
  const policies = await dao.loadPolicies();
  const current = policies[share] ?? { ...DEFAULT_POLICY };
  const merged: VersionPolicyConfig = {
    mode: patch.mode ?? current.mode,
    maxVersions: patch.maxVersions ?? current.maxVersions,
    maxDays: patch.maxDays ?? current.maxDays,
  };
  policies[share] = merged;
  await dao.savePolicies(policies);
  return merged;
}

/**
 * 按策略裁剪旧版本（maxVersions 数量上限 + maxDays 时间上限）
 * 被裁剪的版本文件与元数据一并删除
 * @param uid - 用户 UID
 * @param relativePath - 原始文件相对路径
 * @param policy - 生效策略
 * @returns 裁剪后保留的版本列表
 */
export async function pruneVersions(
  uid: number,
  relativePath: string,
  policy: VersionPolicyConfig,
): Promise<VersionEntry[]> {
  const meta = await dao.loadMeta(uid, relativePath);
  const versionDir = dao.getVersionDir(uid, relativePath);
  const now = Date.now();
  const maxAgeMs = policy.maxDays * 24 * 60 * 60 * 1000;

  // 先按时间过滤，再按版本号降序保留最新的 maxVersions 个
  const fresh = meta.versions.filter(
    (v) => now - new Date(v.createdAt).getTime() <= maxAgeMs,
  );
  fresh.sort((a, b) => b.version - a.version);
  const kept = fresh.slice(0, policy.maxVersions);
  const keptSet = new Set(kept.map((v) => v.version));

  // 删除被淘汰的版本文件
  for (const v of meta.versions) {
    if (!keptSet.has(v.version)) {
      await fs.rm(path.join(versionDir, `v${v.version}`), { force: true });
    }
  }

  kept.sort((a, b) => a.version - b.version);
  await dao.saveMeta(uid, relativePath, { versions: kept });
  return kept;
}

/**
 * 保存文件当前内容为新版本快照（在文件被修改前调用）
 * 按策略模式处理：off=不保存 / simple=仅留 1 版 / multiversion=旋转保留
 * @param uid - 用户 UID
 * @param relativePath - 原始文件相对路径
 * @param share - 用于查询策略的共享名（默认 'default'）
 * @returns 新版本号；off 模式或源文件不存在时返回 null
 */
export async function saveVersion(
  uid: number,
  relativePath: string,
  share = 'default',
): Promise<number | null> {
  const policy = await getPolicy(share);
  if (policy.mode === 'off') {
    return null;
  }

  const absPath = resolveUserPath(uid, relativePath);
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    throw AppError.notFound(`文件 [${relativePath}]`);
  }
  if (stat.isDirectory()) {
    throw AppError.badRequest('IS_DIR', `[${relativePath}] 是目录，不能创建版本`);
  }

  const meta = await dao.loadMeta(uid, relativePath);
  const nextVersion = meta.versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
  const versionDir = dao.getVersionDir(uid, relativePath);
  await fs.mkdir(versionDir, { recursive: true });
  await fs.copyFile(absPath, path.join(versionDir, `v${nextVersion}`));

  const entry: VersionEntry = {
    version: nextVersion,
    filename: path.basename(relativePath),
    size: stat.size,
    createdAt: new Date().toISOString(),
    filePath: relativePath,
  };
  meta.versions.push(entry);
  await dao.saveMeta(uid, relativePath, { versions: meta.versions });

  // simple 模式仅保留最新 1 版，multiversion 按策略裁剪
  const effective: VersionPolicyConfig =
    policy.mode === 'simple' ? { ...policy, maxVersions: 1 } : policy;
  await pruneVersions(uid, relativePath, effective);

  return nextVersion;
}

/**
 * 列出某文件的版本历史
 * @param uid - 用户 UID
 * @param relativePath - 原始文件相对路径
 * @returns 版本列表结果
 */
export async function listVersions(
  uid: number,
  relativePath: string,
): Promise<VersionListResult> {
  resolveUserPath(uid, relativePath);
  const meta = await dao.loadMeta(uid, relativePath);
  return { versions: meta.versions, path: relativePath, total: meta.versions.length };
}

/**
 * 获取某版本快照文件的绝对路径（供下载）
 * @param uid - 用户 UID
 * @param relativePath - 原始文件相对路径
 * @param version - 版本号
 * @returns 快照文件绝对路径与原始文件名
 */
export async function getVersionFile(
  uid: number,
  relativePath: string,
  version: number,
): Promise<{ absPath: string; filename: string }> {
  resolveUserPath(uid, relativePath);
  const meta = await dao.loadMeta(uid, relativePath);
  const entry = meta.versions.find((v) => v.version === version);
  if (!entry) {
    throw AppError.notFound(`版本 [v${version}]`);
  }
  const absPath = path.join(dao.getVersionDir(uid, relativePath), `v${version}`);
  try {
    await fs.access(absPath);
  } catch {
    throw AppError.notFound(`版本文件 [v${version}]`);
  }
  return { absPath, filename: entry.filename };
}

/**
 * 将指定版本快照恢复（复制）回原文件路径
 * @param uid - 用户 UID
 * @param relativePath - 原始文件相对路径
 * @param version - 版本号
 * @returns 恢复结果
 */
export async function restoreVersion(
  uid: number,
  relativePath: string,
  version: number,
): Promise<VersionRestoreResult> {
  const { absPath } = await getVersionFile(uid, relativePath, version);
  const targetPath = resolveUserPath(uid, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(absPath, targetPath);
  const stat = await fs.stat(targetPath);
  return { restored: relativePath, version, size: stat.size };
}

/**
 * 删除指定版本快照
 * @param uid - 用户 UID
 * @param relativePath - 原始文件相对路径
 * @param version - 版本号
 * @returns 删除结果
 */
export async function deleteVersion(
  uid: number,
  relativePath: string,
  version: number,
): Promise<VersionDeleteResult> {
  resolveUserPath(uid, relativePath);
  const meta = await dao.loadMeta(uid, relativePath);
  const exists = meta.versions.some((v) => v.version === version);
  if (!exists) {
    throw AppError.notFound(`版本 [v${version}]`);
  }
  const versionDir = dao.getVersionDir(uid, relativePath);
  await fs.rm(path.join(versionDir, `v${version}`), { force: true });
  await dao.saveMeta(uid, relativePath, {
    versions: meta.versions.filter((v) => v.version !== version),
  });
  return { deleted: relativePath, version };
}

export type { VersionPolicyMode };
