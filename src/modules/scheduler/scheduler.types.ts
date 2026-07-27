/**
 * 模块：计划任务 — 类型定义
 */
export interface ScheduledJob {
  id: string;
  name: string;
  command: string;
  schedule: string;
  enabled: boolean;
  lastRun: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
  nextRun: string | null;
}

export interface JobExecution {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  status: 'running' | 'success' | 'failed';
}
