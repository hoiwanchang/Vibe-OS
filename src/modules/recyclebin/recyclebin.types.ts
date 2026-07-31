/**
 * 模块：回收站策略 — 类型定义
 */

/** 单个共享文件夹的回收站配置 */
export interface ShareRecycleBinConfig {
  /** 共享文件夹名称 */
  shareName: string;
  /** 是否启用回收站 */
  enabled: boolean;
  /** 保留天数（0 = 不限） */
  retentionDays: number;
  /** 大小上限（字节，0 = 不限） */
  maxSizeBytes: number;
  /** 排除的扩展名列表（如 [".tmp", ".log"]） */
  excludeExtensions: string[];
  /** 排除的路径模式列表（如 ["temp/", "cache/"]） */
  excludePaths: string[];
}

/** 全局回收站配置 */
export interface RecycleBinConfig {
  /** 各共享文件夹的回收站配置 */
  shares: ShareRecycleBinConfig[];
}

/** 更新回收站配置请求 */
export interface UpdateRecycleBinConfigRequest {
  /** 各共享文件夹的回收站配置 */
  shares: ShareRecycleBinConfig[];
}

/** 回收站中的文件条目 */
export interface RecycleBinFile {
  /** 唯一标识（基于路径的哈希） */
  id: string;
  /** 原始路径 */
  originalPath: string;
  /** 回收站中的当前路径 */
  currentPath: string;
  /** 所属共享文件夹 */
  shareName: string;
  /** 文件大小（字节） */
  sizeBytes: number;
  /** 删除时间（ISO 8601） */
  deletedAt: string;
}

/** 回收站统计信息 */
export interface RecycleBinStats {
  /** 文件总数 */
  totalFiles: number;
  /** 总大小（字节） */
  totalSizeBytes: number;
  /** 各共享文件夹的统计 */
  perShare: ShareRecycleBinStats[];
}

/** 单个共享文件夹的回收站统计 */
export interface ShareRecycleBinStats {
  /** 共享文件夹名称 */
  shareName: string;
  /** 是否启用回收站 */
  enabled: boolean;
  /** 文件数量 */
  fileCount: number;
  /** 占用大小（字节） */
  sizeBytes: number;
}

/** 恢复文件结果 */
export interface RestoreResult {
  /** 是否成功 */
  restored: boolean;
  /** 恢复后的路径 */
  restoredPath: string;
}

/** 清空回收站结果 */
export interface EmptyResult {
  /** 删除的文件数 */
  deletedCount: number;
  /** 释放的空间（字节） */
  freedBytes: number;
}
