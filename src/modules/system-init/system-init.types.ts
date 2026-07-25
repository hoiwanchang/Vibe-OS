/**
 * 模块1：系统初始化与数据目录管理 — 类型定义
 */

/** 数据目录初始化请求 */
export interface InitDataRequest {
  /** 是否强制重建已存在的目录结构 */
  force?: boolean;
}

/** 数据目录初始化结果 */
export interface InitDataResult {
  /** 数据根目录 */
  dataRoot: string;
  /** 已创建的目录列表 */
  createdDirs: string[];
  /** 已存在（跳过）的目录列表 */
  existingDirs: string[];
  /** 权限校验结果 */
  permissionCheck: PermissionCheckResult;
  /** 初始化是否成功 */
  success: boolean;
}

/** 权限校验结果 */
export interface PermissionCheckResult {
  /** 数据根目录是否可写 */
  dataRootWritable: boolean;
  /** secrets 目录权限是否为 0700 */
  secretsDirSecure: boolean;
  /** 当前运行用户 */
  currentUser: string;
  /** 是否以 root 运行（应为 false） */
  isRoot: boolean;
}

/** 用户配额信息 */
export interface UserQuotaInfo {
  /** 用户 UID */
  uid: number;
  /** 用户数据目录 */
  dataDir: string;
  /** 已使用空间（字节，字符串形式以兼容 JSON） */
  usedBytes: string;
  /** 配额上限（字节，字符串形式） */
  quotaBytes: string;
  /** 使用率百分比 */
  usagePercent: number;
  /** 各子目录使用情况 */
  subdirs: Array<{
    name: string;
    usedBytes: string;
  }>;
}

/** 用户 UID 映射信息 */
export interface UserMapping {
  /** 系统 UID */
  uid: number;
  /** 用户名 */
  username: string;
  /** 数据目录路径 */
  dataDir: string;
  /** 数据目录是否存在 */
  dirExists: boolean;
}
