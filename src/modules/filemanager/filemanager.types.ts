/**
 * 模块：文件管理器 — 类型定义
 */

/** 文件条目 */
export interface FileEntry {
  name: string;
  /** 相对于用户根的路径 */
  path: string;
  type: 'file' | 'directory' | 'symlink';
  /** 字节，目录为 0 */
  size: number;
  /** ISO 8601 */
  modifiedAt: string;
  /** 如 "rwxr-xr-x" */
  permissions: string;
  /** 仅文件 */
  mimeType?: string;
}

/** 目录列表响应 */
export interface ListResult {
  entries: FileEntry[];
  path: string;
  total: number;
}

/** 文件读取响应 */
export interface ReadResult {
  content: string;
  size: number;
  truncated: boolean;
  mimeType: string;
}

/** 写入响应 */
export interface WriteResult {
  written: string;
  size: number;
}

/** 删除响应 */
export interface DeleteResult {
  deleted: string;
  method: 'trash' | 'permanent';
}

/** 复制响应 */
export interface CopyResult {
  copied: string;
  dest: string;
}

/** 上传响应 */
export interface UploadResult {
  uploaded: string;
  size: number;
}

/** 预览类型分类 */
export type PreviewKind =
  | 'image'
  | 'text'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'unsupported';

/** 文件预览响应 */
export interface PreviewResult {
  kind: PreviewKind;
  mimeType: string;
  size: number;
  /** 仅文本/代码类返回内容 */
  content?: string;
  /** 文本内容是否被截断（超过 1MB） */
  truncated?: boolean;
}

/** 缩略图响应 */
export interface ThumbnailResult {
  /** 缩略图 PNG 的绝对路径 */
  absPath: string;
  mimeType: 'image/png';
  size: number;
  /** 是否命中缓存 */
  cached: boolean;
}
