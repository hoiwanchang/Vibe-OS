/**
 * 模块：全文搜索 — 持久化层
 * 基于 better-sqlite3 FTS5 虚表，索引库位于 VIBEOS_APP_DIR/search/index.db
 */
import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';

/** FTS5 虚表一行（与建表列对应） */
export interface FileRow {
  filename: string;
  content: string;
  path: string;
  uid: number;
  size: number;
  mtime: string;
}

/** 搜索原始命中行 */
export interface SearchRow {
  filename: string;
  path: string;
  size: number;
  mtime: string;
  snippet: string;
}

let db: Database.Database | null = null;

/**
 * 获取（惰性初始化）索引数据库连接
 * 首次调用时创建目录与 FTS5 虚表
 */
export function getDb(): Database.Database {
  if (db) return db;
  const dir = path.join(VIBEOS_APP_DIR, 'search');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'index.db'));
  db.pragma('journal_mode = WAL');
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS files USING fts5(
      filename,
      content,
      path UNINDEXED,
      uid UNINDEXED,
      size UNINDEXED,
      mtime UNINDEXED,
      tokenize='unicode61'
    )`,
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
 * 插入或替换一个文件的索引行（按 uid+path 去重）
 */
export function upsertFile(row: FileRow): void {
  const d = getDb();
  d.prepare('DELETE FROM files WHERE uid = ? AND path = ?').run(row.uid, row.path);
  d.prepare(
    'INSERT INTO files (filename, content, path, uid, size, mtime) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(row.filename, row.content, row.path, row.uid, row.size, row.mtime);
}

/**
 * 从索引中删除指定用户的某个相对路径
 */
export function deleteFile(uid: number, relPath: string): void {
  getDb().prepare('DELETE FROM files WHERE uid = ? AND path = ?').run(uid, relPath);
}

/**
 * 清空指定用户的全部索引（reindex 前置）
 */
export function deleteUid(uid: number): void {
  getDb().prepare('DELETE FROM files WHERE uid = ?').run(uid);
}

/**
 * 全文搜索
 * @param uid - 用户 UID
 * @param match - FTS5 MATCH 表达式
 * @param filters - 附加 SQL 条件片段与参数（type/path/from/to）
 * @param limit - 分页大小
 * @param offset - 分页偏移
 * @returns 命中行（含 snippet）与未分页总数
 */
export function search(
  uid: number,
  match: string,
  filters: { clause: string; params: (string | number)[] },
  limit: number,
  offset: number,
): { rows: SearchRow[]; total: number } {
  const d = getDb();
  const where = `uid = ? AND files MATCH ?${filters.clause}`;
  const baseParams: (string | number)[] = [uid, match, ...filters.params];

  const totalRow = d
    .prepare(`SELECT COUNT(*) AS c FROM files WHERE ${where}`)
    .get(...baseParams) as { c: number };

  const rows = d
    .prepare(
      `SELECT filename, path, size, mtime,
              snippet(files, 1, '<mark>', '</mark>', '…', 12) AS snippet
       FROM files WHERE ${where}
       ORDER BY rank
       LIMIT ? OFFSET ?`,
    )
    .all(...baseParams, limit, offset) as SearchRow[];

  return { rows, total: totalRow.c };
}

/**
 * 查询指定用户的索引统计
 */
export function getStatus(uid: number): {
  indexedFiles: number;
  totalBytes: number;
  lastIndexed: string | null;
} {
  const d = getDb();
  const row = d
    .prepare(
      'SELECT COUNT(*) AS c, COALESCE(SUM(size), 0) AS b, MAX(mtime) AS m FROM files WHERE uid = ?',
    )
    .get(uid) as { c: number; b: number; m: string | null };
  return { indexedFiles: row.c, totalBytes: row.b, lastIndexed: row.m };
}
