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
