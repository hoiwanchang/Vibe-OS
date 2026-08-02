/**
 * 模块：审计日志 — 业务逻辑层
 * 敏感操作判定、日志查询、统计、导出、轮转
 */
import * as dao from './audit.dao.js';
import type {
  AuditEntry,
  AuditQueryParams,
  AuditQueryResult,
  AuditStats,
  ExportParams,
} from './audit.types.js';

/**
 * 敏感操作匹配规则
 * 匹配 method + path 模式 → sensitive: true
 */
const SENSITIVE_PATTERNS: Array<{ method?: string; pattern: RegExp }> = [
  // 登录/登出
  { method: 'POST', pattern: /^\/api\/auth\/login$/ },
  { method: 'POST', pattern: /^\/api\/auth\/logout$/ },
  // 用户创建/删除
  { method: 'POST', pattern: /^\/api\/users$/ },
  { method: 'DELETE', pattern: /^\/api\/users\/\d+$/ },
  // 文件删除
  { method: 'DELETE', pattern: /^\/api\/files/ },
  // 权限变更（角色修改、密码修改）
  { method: 'PUT', pattern: /^\/api\/users\/\d+\/role$/ },
  { method: 'POST', pattern: /^\/api\/auth\/change-password$/ },
  // 服务启停
  { method: 'POST', pattern: /^\/api\/container\/.*\/(start|stop|restart)$/ },
  { method: 'POST', pattern: /^\/api\/apps\/.*\/(start|stop|restart)$/ },
];

/**
 * 判断请求是否为敏感操作
 */
export function isSensitive(method: string, path: string): boolean {
  return SENSITIVE_PATTERNS.some(
    (rule) =>
      (rule.method === undefined || rule.method === method) &&
      rule.pattern.test(path),
  );
}

/**
 * 记录一条审计日志
 */
export function recordLog(entry: {
  uid: number;
  username: string;
  method: string;
  path: string;
  status: number;
  ip: string;
}): void {
  dao.insertLog({
    uid: entry.uid,
    username: entry.username,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    ip: entry.ip,
    sensitive: isSensitive(entry.method, entry.path) ? 1 : 0,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 构建过滤 SQL 子句
 */
function buildFilters(params: {
  user?: string;
  action?: string;
  from?: string;
  to?: string;
}): { clause: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const sqlParams: (string | number)[] = [];
  if (params.user) {
    clauses.push('username = ?');
    sqlParams.push(params.user);
  }
  if (params.action) {
    clauses.push('(method || \' \' || path) LIKE ?');
    sqlParams.push(`%${params.action}%`);
  }
  if (params.from) {
    clauses.push('timestamp >= ?');
    sqlParams.push(params.from);
  }
  if (params.to) {
    clauses.push('timestamp <= ?');
    sqlParams.push(params.to);
  }
  return { clause: clauses.join(' AND '), params: sqlParams };
}

/**
 * 分页查询审计日志
 */
export function queryLogs(params: AuditQueryParams): AuditQueryResult {
  const filters = buildFilters(params);
  const offset = (params.page - 1) * params.size;
  const { rows, total } = dao.queryLogs(filters, params.size, offset);
  return { logs: rows, total, page: params.page, size: params.size };
}

/**
 * 获取今日统计
 */
export function getStats(): AuditStats {
  const todayPrefix = new Date().toISOString().slice(0, 10);
  return dao.getStats(todayPrefix);
}

/**
 * 导出审计日志
 * @returns CSV 字符串或 AuditEntry 数组
 */
export function exportLogs(params: ExportParams): string | AuditEntry[] {
  const filters = buildFilters(params);
  const rows = dao.queryAllForExport(filters);

  if (params.format === 'json') {
    return rows;
  }

  // CSV 格式
  const header = 'id,uid,username,method,path,status,ip,sensitive,timestamp';
  const lines = rows.map((r) =>
    [
      r.id,
      r.uid,
      csvEscape(r.username),
      r.method,
      csvEscape(r.path),
      r.status,
      csvEscape(r.ip),
      r.sensitive,
      r.timestamp,
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

/**
 * CSV 字段转义（含逗号/引号/换行的字段用双引号包裹）
 */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * 执行日志轮转（删除 90 天前记录）
 * @returns 删除的行数
 */
export function rotateLogs(): number {
  return dao.rotate();
}
