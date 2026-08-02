/**
 * 模块：全文搜索 — 业务逻辑层
 * 递归扫描 DATA_ROOT/{uid}/ 下文本文件，写入 FTS5 索引并提供检索
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DATA_ROOT } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import * as dao from './search.dao.js';
import type {
  IndexStatus,
  ReindexResult,
  SearchParams,
  SearchResults,
  SearchResultItem,
} from './search.types.js';

/** 单文件内容索引上限 1MB（超过仅索引前 1MB） */
const CONTENT_LIMIT = 1024 * 1024;

/** 支持索引内容（而非仅文件名）的文本扩展名 */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'yaml', 'yml', 'csv', 'log', 'js', 'ts', 'py', 'sh',
]);

/** 扫描时跳过的隐藏/系统目录名 */
const SKIP_DIRS = new Set([
  '.trash', '.versions', 'node_modules', '.git', '.cache', '.ssh',
]);

/**
 * 获取用户根目录
 */
function getUserRoot(uid: number): string {
  return path.join(DATA_ROOT, String(uid));
}

/**
 * 校验相对路径位于用户根内，返回绝对路径
 * @throws AppError 403 路径穿越
 */
function resolveSafe(uid: number, relPath: string): string {
  const userRoot = getUserRoot(uid);
  const resolved = path.resolve(userRoot, relPath);
  if (!resolved.startsWith(userRoot + path.sep) && resolved !== userRoot) {
    throw AppError.forbidden(`路径穿越检测: 路径不在 /data/${uid}/ 内`);
  }
  return resolved;
}

/**
 * 判断扩展名是否为可索引文本类型
 */
function extOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : '';
}

/**
 * 转义 snippet 中的 HTML 特殊字符，但保留 FTS5 生成的 <mark> 高亮标签
 * 防止文件内容中的 <script> 等被前端 v-html 渲染导致 XSS
 * @param raw - 含 <mark> 标记的原始 snippet
 * @returns 安全的 HTML 片段
 */
function sanitizeSnippet(raw: string): string {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // 还原被转义的高亮标签
  return escaped.replace(/&lt;mark&gt;/g, '<mark>').replace(/&lt;\/mark&gt;/g, '</mark>');
}

/**
 * 读取文件内容用于索引（文本类型截断到 1MB，二进制类型返回空串）
 */
function readContentForIndex(absPath: string, filename: string): string {
  if (!TEXT_EXTENSIONS.has(extOf(filename))) {
    return '';
  }
  const stat = fs.statSync(absPath);
  const len = Math.min(stat.size, CONTENT_LIMIT);
  const buffer = Buffer.alloc(len);
  const fd = fs.openSync(absPath, 'r');
  try {
    fs.readSync(fd, buffer, 0, len, 0);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString('utf-8');
}

/**
 * 索引单个文件（增量入口）
 * @param uid - 用户 UID
 * @param absPath - 文件绝对路径
 * @param relPath - 相对于用户根的路径
 */
export function indexFile(uid: number, absPath: string, relPath: string): void {
  // 校验相对路径位于用户根内，防止索引穿越路径
  resolveSafe(uid, relPath);
  const stat = fs.statSync(absPath);
  const filename = path.basename(relPath);
  const content = readContentForIndex(absPath, filename);
  dao.upsertFile({
    filename,
    content,
    path: relPath,
    uid,
    size: stat.size,
    mtime: stat.mtime.toISOString(),
  });
}

/**
 * 从索引中移除指定用户的某个相对路径
 */
export function removeFromIndex(uid: number, relPath: string): void {
  dao.deleteFile(uid, relPath);
}

/**
 * 递归扫描并索引用户目录（增量/全量通用）
 * @returns 已索引文件数
 */
export function scanAndIndex(uid: number): number {
  const userRoot = resolveSafe(uid, '');
  if (!fs.existsSync(userRoot)) {
    throw AppError.notFound(`用户目录 [${uid}]`);
  }
  let count = 0;

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        walk(abs);
      } else if (entry.isFile()) {
        const rel = path.relative(userRoot, abs);
        try {
          indexFile(uid, abs, rel);
          count++;
        } catch {
          // 跳过无法读取的文件
        }
      }
    }
  };

  walk(userRoot);
  return count;
}

/**
 * 全量重建指定用户索引
 */
export function reindex(uid: number): ReindexResult {
  const start = Date.now();
  resolveSafe(uid, '');
  dao.deleteUid(uid);
  const indexed = scanAndIndex(uid);
  return { indexed, durationMs: Date.now() - start };
}

/**
 * 转义 FTS5 查询中的双引号，构造短语/原样匹配表达式
 * 用户输入直接作为 MATCH 表达式（支持 AND/OR/引号短语）
 */
function buildMatch(q: string): string {
  const trimmed = q.trim();
  if (trimmed === '') {
    throw AppError.badRequest('EMPTY_QUERY', '搜索关键词不能为空');
  }
  return trimmed;
}

/**
 * 全文搜索
 */
export function searchFiles(params: SearchParams): SearchResults {
  const { uid, q, type, path: pathPrefix, from, to, page, size } = params;
  resolveSafe(uid, '');
  const match = buildMatch(q);

  const clauses: string[] = [];
  const filterParams: (string | number)[] = [];
  if (type) {
    clauses.push(' AND filename LIKE ?');
    filterParams.push(`%.${type}`);
  }
  if (pathPrefix) {
    clauses.push(' AND path LIKE ?');
    filterParams.push(`${pathPrefix}%`);
  }
  if (from) {
    clauses.push(' AND mtime >= ?');
    filterParams.push(from);
  }
  if (to) {
    clauses.push(' AND mtime <= ?');
    filterParams.push(to);
  }

  const offset = (page - 1) * size;
  const { rows, total } = dao.search(
    uid,
    match,
    { clause: clauses.join(''), params: filterParams },
    size,
    offset,
  );

  const results: SearchResultItem[] = rows.map((r) => ({
    filename: r.filename,
    path: r.path,
    size: r.size,
    mtime: r.mtime,
    snippet: sanitizeSnippet(r.snippet),
  }));

  return { results, total, page, size };
}

/**
 * 获取索引状态
 */
export function getIndexStatus(uid: number): IndexStatus {
  resolveSafe(uid, '');
  return dao.getStatus(uid);
}
