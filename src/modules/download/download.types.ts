/**
 * 模块：下载中心 — 类型定义
 */
export interface DownloadTask {
  gid: string;
  name: string;
  status: 'active' | 'waiting' | 'paused' | 'complete' | 'error' | 'removed';
  totalBytes: number;
  completedBytes: number;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  connections: number;
  eta: number | null;
  dir: string;
  files: Array<{ path: string; length: number; completedLength: number }>;
  error?: string;
  startedAt: string;
  completedAt: string | null;
}
