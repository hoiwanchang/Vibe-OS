/**
 * 模块：安全（IP 封禁） — 类型定义
 */

/** 封禁来源 */
export type BanSource = 'auto' | 'manual';

/** 单条封禁记录 */
export interface BannedEntry {
  /** 被封禁的 IP 地址 */
  ip: string;
  /** 封禁原因 */
  reason: string;
  /** 封禁来源（自动 / 手动） */
  source: BanSource;
  /** 封禁时间（ISO 8601） */
  bannedAt: string;
  /** 过期时间（ISO 8601），null 表示永久封禁 */
  expiresAt: string | null;
}

/** 登录失败计数条目 */
export interface FailCountEntry {
  /** 失败次数 */
  count: number;
  /** 最后一次失败时间（ISO 8601） */
  lastAttempt: string;
}

/** 失败计数映射（IP → 条目） */
export type FailCountMap = Record<string, FailCountEntry>;

/** 封禁策略配置 */
export interface SecurityPolicy {
  /** 触发自动封禁的最大失败次数 */
  maxAttempts: number;
  /** 自动封禁时长（小时） */
  banDurationHours: number;
  /** 白名单 IP 列表（永不封禁） */
  whitelist: string[];
}

/** 记录失败结果 */
export interface RecordFailureResult {
  /** 当前失败次数 */
  count: number;
  /** 是否触发了自动封禁 */
  banned: boolean;
  /** 是否因白名单豁免 */
  whitelisted: boolean;
}
