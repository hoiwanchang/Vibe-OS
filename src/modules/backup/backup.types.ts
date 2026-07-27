/**
 * 模块：备份与快照 — 类型定义
 */
export interface BackupJob {
  id: string;
  name: string;
  source: string;
  target: string;
  type: 'rsync' | 'snapshot' | 'archive';
  schedule: string | null;
  enabled: boolean;
  lastRun: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
}

export interface BackupExecution {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'failed';
  filesTransferred: number;
  bytesTransferred: number;
  error?: string;
}

export interface SnapshotInfo {
  name: string;
  pool: string;
  createdAt: string;
  usedBytes: number;
  referencedBytes: number;
}
