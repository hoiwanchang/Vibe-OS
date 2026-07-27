/**
 * 模块5：用户与权限管理 — 类型定义
 */

/** 受管用户条目 */
export interface ManagedUser {
  /** 用户 UID */
  uid: number;
  /** 用户名（来自 /etc/passwd 或 NAISys 映射文件） */
  username: string;
  /** 数据目录路径 */
  dataDir: string;
  /** 数据目录是否已初始化 */
  dirExists: boolean;
  /** 已使用空间（字节，字符串形式） */
  usedBytes: string;
  /** 配额上限（字节，字符串形式） */
  quotaBytes: string;
  /** 使用率百分比 */
  usagePercent: number;
}

/** 创建用户请求 */
export interface CreateUserRequest {
  /** 用户名（小写字母/数字/下划线/连字符，字母或下划线开头） */
  username: string;
  /** 指定 UID（可选，默认自动分配 /data 下最大 UID + 1） */
  uid?: number;
  /** 配额（字节字符串，可选，默认使用全局配置） */
  quotaBytes?: string;
}

/** 创建用户响应 */
export interface CreateUserResponse {
  uid: number;
  username: string;
  dataDir: string;
  /** 新创建的目录列表 */
  createdDirs: string[];
  /** 配额是否设置成功（文件系统不支持时为 false） */
  quotaSet: boolean;
}

/** 用户列表响应 */
export interface UserListResponse {
  timestamp: string;
  count: number;
  users: ManagedUser[];
}
