/**
 * 模块：计划任务 — 业务逻辑层
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { NAISYS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { executeCommand } from '../../system/command-executor.js';
import type { ScheduledJob, JobExecution } from './scheduler.types.js';

const JOBS_FILE = `${NAISYS_APP_DIR}/scheduler/jobs.json`;
const LOGS_DIR = `${NAISYS_APP_DIR}/scheduler/logs`;

/** 破坏性命令黑名单 */
const DANGEROUS_PATTERNS = [
  /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\//,
  /mkfs/,
  /dd\s+if=/,
  />\s*\/dev\/[sh]d/,
  /chmod\s+777\s+\//,
  /:(){ :|:& };:/,
];

async function loadJobs(): Promise<ScheduledJob[]> {
  try {
    return JSON.parse(await fs.readFile(JOBS_FILE, 'utf-8')) as ScheduledJob[];
  } catch { return []; }
}

async function saveJobs(jobs: ScheduledJob[]): Promise<void> {
  await fs.mkdir(path.dirname(JOBS_FILE), { recursive: true });
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

async function loadExecutions(jobId: string): Promise<JobExecution[]> {
  try {
    return JSON.parse(await fs.readFile(`${LOGS_DIR}/${jobId}.json`, 'utf-8')) as JobExecution[];
  } catch { return []; }
}

async function saveExecutions(jobId: string, execs: JobExecution[]): Promise<void> {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await fs.writeFile(`${LOGS_DIR}/${jobId}.json`, JSON.stringify(execs, null, 2), 'utf-8');
}

/** 校验命令安全性 */
function assertSafeCommand(command: string): void {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw AppError.forbidden(`命令包含危险操作，已被拒绝: ${command}`);
    }
  }
}

/** 列出计划任务 */
export async function listJobs(): Promise<ScheduledJob[]> {
  return loadJobs();
}

/** 创建计划任务 */
export async function createJob(data: { name: string; command: string; schedule: string; enabled?: boolean }): Promise<ScheduledJob> {
  assertSafeCommand(data.command);
  const jobs = await loadJobs();
  const job: ScheduledJob = {
    id: randomUUID(),
    name: data.name,
    command: data.command,
    schedule: data.schedule,
    enabled: data.enabled ?? true,
    lastRun: null,
    lastStatus: null,
    nextRun: null,
  };
  jobs.push(job);
  await saveJobs(jobs);
  return job;
}

/** 修改计划任务 */
export async function updateJob(id: string, updates: Partial<{ name: string; command: string; schedule: string; enabled: boolean }>): Promise<ScheduledJob> {
  if (updates.command) assertSafeCommand(updates.command);
  const jobs = await loadJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) throw AppError.notFound(`计划任务 [${id}]`);
  const existing = jobs[idx];
  if (!existing) throw AppError.notFound(`计划任务 [${id}]`);
  const updated: ScheduledJob = {
    ...existing,
    name: updates.name ?? existing.name,
    command: updates.command ?? existing.command,
    schedule: updates.schedule ?? existing.schedule,
    enabled: updates.enabled ?? existing.enabled,
  };
  jobs[idx] = updated;
  await saveJobs(jobs);
  return updated;
}

/** 删除计划任务 */
export async function deleteJob(id: string): Promise<string> {
  const jobs = await loadJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx === -1) throw AppError.notFound(`计划任务 [${id}]`);
  jobs.splice(idx, 1);
  await saveJobs(jobs);
  return id;
}

/** 立即执行 */
export async function runJob(id: string): Promise<JobExecution> {
  const jobs = await loadJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) throw AppError.notFound(`计划任务 [${id}]`);

  assertSafeCommand(job.command);

  const exec: JobExecution = {
    id: randomUUID(),
    jobId: id,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    stdout: '',
    stderr: '',
    status: 'running',
  };

  job.lastRun = exec.startedAt;
  job.lastStatus = 'running';
  await saveJobs(jobs);

  const result = await executeCommand('bash', ['-c', job.command], 300000);
  exec.exitCode = result.exitCode;
  exec.stdout = result.stdout.slice(0, 10240); // 截断到 10KB
  exec.stderr = result.stderr.slice(0, 10240);
  exec.status = result.exitCode === 0 ? 'success' : 'failed';
  exec.finishedAt = new Date().toISOString();

  job.lastStatus = exec.status === 'success' ? 'success' : 'failed';
  await saveJobs(jobs);

  const execs = await loadExecutions(id);
  execs.push(exec);
  if (execs.length > 100) execs.splice(0, execs.length - 100);
  await saveExecutions(id, execs);

  return exec;
}

/** 执行历史 */
export async function getHistory(id: string, limit: number): Promise<JobExecution[]> {
  const execs = await loadExecutions(id);
  return execs.slice(-limit);
}
