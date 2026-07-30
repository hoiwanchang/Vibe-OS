/**
 * 模块：备份与快照 — 业务逻辑层
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { VIBEOS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import type { BackupJob, BackupExecution, SnapshotInfo } from './backup.types.js';

const JOBS_FILE = `${VIBEOS_APP_DIR}/backup/jobs.json`;
const EXEC_DIR = `${VIBEOS_APP_DIR}/backup/executions`;

async function loadJobs(): Promise<BackupJob[]> {
  try {
    return JSON.parse(await fs.readFile(JOBS_FILE, 'utf-8')) as BackupJob[];
  } catch { return []; }
}

async function saveJobs(jobs: BackupJob[]): Promise<void> {
  await fs.mkdir(path.dirname(JOBS_FILE), { recursive: true });
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

async function loadExecutions(jobId: string): Promise<BackupExecution[]> {
  try {
    return JSON.parse(await fs.readFile(`${EXEC_DIR}/${jobId}.json`, 'utf-8')) as BackupExecution[];
  } catch { return []; }
}

async function saveExecutions(jobId: string, execs: BackupExecution[]): Promise<void> {
  await fs.mkdir(EXEC_DIR, { recursive: true });
  await fs.writeFile(`${EXEC_DIR}/${jobId}.json`, JSON.stringify(execs, null, 2), 'utf-8');
}

/** 列出备份任务 */
export async function listJobs(): Promise<BackupJob[]> {
  return loadJobs();
}

/** 创建备份任务 */
export async function createJob(data: { name: string; source: string; target: string; schedule?: string; type: 'rsync' | 'snapshot' | 'archive' }): Promise<BackupJob> {
  const jobs = await loadJobs();
  const job: BackupJob = {
    id: randomUUID(),
    name: data.name,
    source: data.source,
    target: data.target,
    type: data.type,
    schedule: data.schedule ?? null,
    enabled: true,
    lastRun: null,
    lastStatus: null,
  };
  jobs.push(job);
  await saveJobs(jobs);
  return job;
}

/** 执行备份 */
export async function runJob(jobId: string): Promise<BackupExecution> {
  const jobs = await loadJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw AppError.notFound(`备份任务 [${jobId}]`);

  const exec: BackupExecution = {
    id: randomUUID(),
    jobId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    filesTransferred: 0,
    bytesTransferred: 0,
  };

  const execs = await loadExecutions(jobId);
  execs.push(exec);
  await saveExecutions(jobId, execs);

  // 更新 job 状态
  job.lastRun = exec.startedAt;
  job.lastStatus = 'running';
  await saveJobs(jobs);

  try {
    if (job.type === 'rsync') {
      const result = await executeCommandStrict('rsync', ['-avz', '--delete', '--stats', job.source, job.target], 600000);
      const filesMatch = result.stdout.match(/Number of regular files transferred:\s*([\d,]+)/);
      const bytesMatch = result.stdout.match(/Total transferred file size:\s*([\d,]+)/);
      exec.filesTransferred = parseInt((filesMatch?.[1] ?? '0').replace(/,/g, ''), 10);
      exec.bytesTransferred = parseInt((bytesMatch?.[1] ?? '0').replace(/,/g, ''), 10);
    } else if (job.type === 'archive') {
      await executeCommandStrict('tar', ['czf', job.target, '-C', path.dirname(job.source), path.basename(job.source)], 600000);
    }
    exec.status = 'success';
    job.lastStatus = 'success';
  } catch (err) {
    exec.status = 'failed';
    exec.error = err instanceof Error ? err.message : String(err);
    job.lastStatus = 'failed';
  }

  exec.finishedAt = new Date().toISOString();
  await saveExecutions(jobId, execs);
  await saveJobs(jobs);
  return exec;
}

/** 删除备份任务 */
export async function deleteJob(jobId: string): Promise<string> {
  const jobs = await loadJobs();
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx === -1) throw AppError.notFound(`备份任务 [${jobId}]`);
  jobs.splice(idx, 1);
  await saveJobs(jobs);
  return jobId;
}

/** 执行历史 */
export async function getHistory(jobId: string): Promise<BackupExecution[]> {
  return loadExecutions(jobId);
}

/** 从备份恢复 */
export async function restore(jobId: string, executionId: string, targetPath?: string): Promise<{ restoreId: string; status: string }> {
  const execs = await loadExecutions(jobId);
  const exec = execs.find((e) => e.id === executionId);
  if (!exec) throw AppError.notFound(`执行记录 [${executionId}]`);

  const jobs = await loadJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw AppError.notFound(`备份任务 [${jobId}]`);

  const restoreId = randomUUID();
  // 异步恢复（rsync 反向）
  if (job.type === 'rsync') {
    const dest = targetPath ?? job.source;
    await executeCommand('rsync', ['-avz', job.target, dest], 600000);
  }
  return { restoreId, status: 'started' };
}

/** 列出快照 */
export async function listSnapshots(pool: string): Promise<SnapshotInfo[]> {
  // 尝试 btrfs
  const btrfsResult = await executeCommand('btrfs', ['subvolume', 'list', '-s', `/data/pools/${pool}`]);
  if (btrfsResult.exitCode === 0) {
    const snapshots: SnapshotInfo[] = [];
    const lines = btrfsResult.stdout.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const nameMatch = line.match(/\s(\S+)$/);
      if (nameMatch) {
        snapshots.push({ name: nameMatch[1] ?? '', pool, createdAt: '', usedBytes: 0, referencedBytes: 0 });
      }
    }
    return snapshots;
  }
  // 尝试 zfs
  const zfsResult = await executeCommand('zfs', ['list', '-t', 'snapshot', '-r', pool, '-H', '-o', 'name,creation,used,referenced']);
  if (zfsResult.exitCode === 0) {
    return zfsResult.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const parts = line.split('\t');
      return { name: parts[0] ?? '', pool, createdAt: parts[1] ?? '', usedBytes: parseInt(parts[2] ?? '0', 10), referencedBytes: parseInt(parts[3] ?? '0', 10) };
    });
  }
  return [];
}

/** 创建快照 */
export async function createSnapshot(pool: string, name: string): Promise<SnapshotInfo> {
  const btrfsResult = await executeCommand('btrfs', ['subvolume', 'snapshot', '-r', `/data/pools/${pool}`, `/data/pools/${pool}/.snapshots/${name}`]);
  if (btrfsResult.exitCode === 0) {
    return { name, pool, createdAt: new Date().toISOString(), usedBytes: 0, referencedBytes: 0 };
  }
  const zfsResult = await executeCommand('zfs', ['snapshot', `${pool}@${name}`]);
  if (zfsResult.exitCode === 0) {
    return { name: `${pool}@${name}`, pool, createdAt: new Date().toISOString(), usedBytes: 0, referencedBytes: 0 };
  }
  throw AppError.commandFailed('btrfs/zfs', '无法创建快照，文件系统不支持');
}

/** 删除快照 */
export async function deleteSnapshot(name: string): Promise<string> {
  const btrfsResult = await executeCommand('btrfs', ['subvolume', 'delete', name]);
  if (btrfsResult.exitCode === 0) return name;
  const zfsResult = await executeCommand('zfs', ['destroy', name]);
  if (zfsResult.exitCode === 0) return name;
  throw AppError.commandFailed('btrfs/zfs', '无法删除快照');
}
