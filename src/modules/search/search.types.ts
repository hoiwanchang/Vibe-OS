/**
 * 模块：全文搜索 — 类型定义
 */

/** 单条搜索命中结果 */
export interface SearchResultItem {
  /** 文件名（basename） */
  filename: string;
  /** 相对于用户根的路径 */
  path: string;
  /** 文件字节数 */
  size: number;
  /** 最后修改时间 ISO 8601 */
  mtime: string;
  /** FTS5 snippet() 生成的高亮片段 */
  snippet: string;
}

/** 搜索响应 */
export interface SearchResults {
  results: SearchResultItem[];
  /** 命中总数（未分页） */
  total: number;
  page: number;
  size: number;
}

/** 搜索参数（service 层） */
export interface SearchParams {
  uid: number;
  /** FTS5 查询语法（AND/OR/引号短语） */
  q: string;
  /** 按扩展名过滤（不含点，如 'md'） */
  type?: string;
  /** 按路径前缀过滤 */
  path?: string;
  /** mtime 下界 ISO 8601 */
  from?: string;
  /** mtime 上界 ISO 8601 */
  to?: string;
  page: number;
  size: number;
}

/** 索引状态 */
export interface IndexStatus {
  indexedFiles: number;
  totalBytes: number;
  /** 最近一次索引时间 ISO 8601，从未索引为 null */
  lastIndexed: string | null;
}

/** 重建索引结果 */
export interface ReindexResult {
  indexed: number;
  durationMs: number;
}
