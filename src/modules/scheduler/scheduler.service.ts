/**
 * 模块：计划任务 — 业务逻辑层
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { VIBEOS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { executeCommand } from '../../system/command-executor.js';
import type { ScheduledJob, JobExecution } from './scheduler.types.js';

const JOBS_FILE = `${VIBEOS_APP_DIR}/scheduler/jobs.json`;
const LOGS_DIR = `${VIBEOS_APP_DIR}/scheduler/logs`;

/** 破坏性命令黑名单（纵深防御，白名单之后二次校验） */
const DANGEROUS_PATTERNS = [
  /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\//,
  /mkfs/,
  /dd\s+if=/,
  />\s*\/dev\/[sh]d/,
  /chmod\s+777\s+\//,
  /:(){ :|:& };:/,
];

/**
 * [安全加固] 命令白名单前缀：仅允许以下命令开头的计划任务。
 * 黑名单极易绕过（base64 -d|bash、python -c、curl|sh 等），
 * 改为白名单机制，只有明确列出的命令前缀才被允许执行。
 */
const ALLOWED_COMMAND_PREFIXES = [
  // 备份与同步
  'rsync ', '/usr/bin/rsync ',
  'tar ', '/usr/bin/tar ',
  // 文件清理（限定 /data 路径）
  'find /data',
  // 磁盘与系统监控
  'df ', 'du ', 'smartctl ',
  'docker ', 'tailscale ',
  // 脚本（限定 /opt/vibeos 或 /data 路径）
  'bash /opt/vibeos/', 'bash /data/',
  '/opt/vibeos/', '/data/',
  // 系统维护
  'apt-get update', 'apt-get upgrade',
  'systemctl restart', 'systemctl reload',
  'journalctl',
];

/** 校验命令安全性（白名单前缀 + 黑名单双重校验） */
function assertSafeCommand(command: string): void {
  const trimmed = command.trim();

  // 白名单前缀校验
  const allowed = ALLOWED_COMMAND_PREFIXES.some((prefix) =>
    trimmed.startsWith(prefix),
  );
  if (!allowed) {
    throw AppError.forbidden(
      `计划任务命令不在允许列表中。允许的命令前缀: ${ALLOWED_COMMAND_PREFIXES.join(', ')}`,
    );
  }

  // 黑名单二次校验（纵深防御）
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw AppError.forbidden(`命令包含危险操作，已被拒绝: ${trimmed}`);
    }
  }

  // 禁止反引号和危险命令替换（防止白名单命令后追加恶意操作）
  if (/`/.test(trimmed) || /\$\(\s*(curl|wget|nc|python|perl|ruby|base64)/.test(trimmed)) {
    throw AppError.forbidden(
      '命令包含危险的 shell 操作（反引号/危险命令替换），已被拒绝',
    );
  }
}

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
