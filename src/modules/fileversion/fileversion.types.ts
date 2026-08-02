/**
 * 模块：文件版本控制 — 类型定义
 */

/** 版本策略模式 */
export type VersionPolicyMode = 'off' | 'simple' | 'multiversion';

/** 版本策略配置 */
export interface VersionPolicyConfig {
  /** 策略模式：off=关闭 / simple=仅保留上一版 / multiversion=多版本旋转 */
  mode: VersionPolicyMode;
  /** 最大保留版本数（multiversion 模式），默认 32 */
  maxVersions: number;
  /** 最大保留天数，默认 30 */
  maxDays: number;
}

/** 单个版本条目 */
export interface VersionEntry {
  /** 版本号（从 1 递增） */
  version: number;
  /** 原始文件名 */
  filename: string;
  /** 文件大小（字节） */
  size: number;
  /** 版本创建时间（ISO 8601） */
  createdAt: string;
  /** 原始文件相对路径 */
  filePath: string;
}

/** 版本列表响应 */
export interface VersionListResult {
  versions: VersionEntry[];
  path: string;
  total: number;
}

/** 版本恢复响应 */
export interface VersionRestoreResult {
  restored: string;
  version: number;
  size: number;
}

/** 版本删除响应 */
export interface VersionDeleteResult {
  deleted: string;
  version: number;
}

/** 默认版本策略 */
export const DEFAULT_POLICY: VersionPolicyConfig = {
  mode: 'multiversion',
  maxVersions: 32,
  maxDays: 30,
};
