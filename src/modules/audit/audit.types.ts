/**
 * 模块：审计日志 — 类型定义
 */

/** 审计日志条目（数据库行） */
export interface AuditEntry {
  /** 自增主键 */
  id: number;
  /** 操作用户 UID（未认证为 -1） */
  uid: number;
  /** 操作用户名（未认证为 'anonymous'） */
  username: string;
  /** HTTP 方法 */
  method: string;
  /** 请求路径 */
  path: string;
  /** 响应状态码 */
  status: number;
  /** 客户端 IP */
  ip: string;
  /** 是否为敏感操作 */
  sensitive: number;
  /** 操作时间 ISO 8601 */
  timestamp: string;
}

/** 审计日志查询参数 */
export interface AuditQueryParams {
  /** 按用户名过滤 */
  user?: string;
  /** 按操作（method + path 模糊匹配）过滤 */
  action?: string;
  /** 时间下界 ISO 8601 */
  from?: string;
  /** 时间上界 ISO 8601 */
  to?: string;
  /** 页码（从 1 开始） */
  page: number;
  /** 每页大小 */
  size: number;
}

/** 审计日志查询结果 */
export interface AuditQueryResult {
  logs: AuditEntry[];
  total: number;
  page: number;
  size: number;
}

/** 审计统计 */
export interface AuditStats {
  /** 今日操作总数 */
  todayTotal: number;
  /** 今日登录次数（POST /api/auth/login） */
  todayLogins: number;
  /** 今日敏感操作数 */
  todaySensitive: number;
}

/** 导出格式 */
export type ExportFormat = 'csv' | 'json';

/** 导出请求参数 */
export interface ExportParams {
  /** 导出格式 */
  format: ExportFormat;
  /** 按用户名过滤 */
  user?: string;
  /** 按操作过滤 */
  action?: string;
  /** 时间下界 */
  from?: string;
  /** 时间上界 */
  to?: string;
}
