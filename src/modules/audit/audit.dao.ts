/**
 * 模块：审计日志 — 持久化层
 * 基于 better-sqlite3，数据库位于 VIBEOS_APP_DIR/audit/audit.db
 * 自动轮转：保留 90 天记录
 */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import type { AuditEntry } from './audit.types.js';

/** 审计日志保留天数 */
const RETENTION_DAYS = 90;

let db: Database.Database | null = null;

/**
 * 获取（惰性初始化）审计数据库连接
 * 首次调用时创建目录与表结构
 */
export function getDb(): Database.Database {
  if (db) return db;
  const dir = path.join(VIBEOS_APP_DIR, 'audit');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'audit.db'));
  db.pragma('journal_mode = WAL');
  db.exec(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid INTEGER NOT NULL,
      username TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INTEGER NOT NULL,
      ip TEXT NOT NULL,
      sensitive INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL
    )`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs (timestamp)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_audit_username ON audit_logs (username)`,
  );
  return db;
}

/**
 * 关闭并重置连接（测试用）
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * 插入一条审计日志
 */
export function insertLog(entry: Omit<AuditEntry, 'id'>): void {
  getDb()
    .prepare(
      `INSERT INTO audit_logs (uid, username, method, path, status, ip, sensitive, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.uid,
      entry.username,
      entry.method,
      entry.path,
      entry.status,
      entry.ip,
      entry.sensitive,
      entry.timestamp,
    );
}

/**
 * 分页查询审计日志（支持过滤）
 */
export function queryLogs(filters: {
  clause: string;
  params: (string | number)[];
}, limit: number, offset: number): { rows: AuditEntry[]; total: number } {
  const d = getDb();
  const where = filters.clause ? `WHERE ${filters.clause}` : '';
  const totalRow = d
    .prepare(`SELECT COUNT(*) AS c FROM audit_logs ${where}`)
    .get(...filters.params) as { c: number };
  const rows = d
    .prepare(
      `SELECT id, uid, username, method, path, status, ip, sensitive, timestamp
       FROM audit_logs ${where}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...filters.params, limit, offset) as AuditEntry[];
  return { rows, total: totalRow.c };
}

/**
 * 查询今日统计
 * @param todayPrefix - 今日日期前缀（如 '2026-07-31'）
 */
export function getStats(todayPrefix: string): {
  todayTotal: number;
  todayLogins: number;
  todaySensitive: number;
} {
  const d = getDb();
  const total = d
    .prepare('SELECT COUNT(*) AS c FROM audit_logs WHERE timestamp LIKE ?')
    .get(`${todayPrefix}%`) as { c: number };
  const logins = d
    .prepare(
      `SELECT COUNT(*) AS c FROM audit_logs
       WHERE timestamp LIKE ? AND method = 'POST' AND path = '/api/auth/login'`,
    )
    .get(`${todayPrefix}%`) as { c: number };
  const sensitive = d
    .prepare(
      'SELECT COUNT(*) AS c FROM audit_logs WHERE timestamp LIKE ? AND sensitive = 1',
    )
    .get(`${todayPrefix}%`) as { c: number };
  return { todayTotal: total.c, todayLogins: logins.c, todaySensitive: sensitive.c };
}

/**
 * 查询所有日志用于导出（支持过滤，最多 10000 条）
 */
export function queryAllForExport(filters: {
  clause: string;
  params: (string | number)[];
}): AuditEntry[] {
  const d = getDb();
  const where = filters.clause ? `WHERE ${filters.clause}` : '';
  return d
    .prepare(
      `SELECT id, uid, username, method, path, status, ip, sensitive, timestamp
       FROM audit_logs ${where}
       ORDER BY id DESC
       LIMIT 10000`,
    )
    .all(...filters.params) as AuditEntry[];
}

/**
 * 轮转：删除超过保留期的旧记录
 * @returns 删除的行数
 */
export function rotate(): number {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result = getDb()
    .prepare('DELETE FROM audit_logs WHERE timestamp < ?')
    .run(cutoff);
  return result.changes;
}
