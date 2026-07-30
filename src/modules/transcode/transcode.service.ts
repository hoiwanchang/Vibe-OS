/**
 * 模块：视频转码 — 业务逻辑层
 * 通过 ffmpeg 命令执行转码，内存队列管理并发（最多 2 个）
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { AppError } from '../../common/app-error.js';
import { executeCommand } from '../../system/command-executor.js';
import { VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import type {
  CreateTranscodeRequest,
  HwAccelInfo,
  HwAccelType,
  TranscodePreset,
  TranscodeResult,
  TranscodeTask,
} from './transcode.types.js';

/** 最大并发转码数 */
const MAX_CONCURRENT = 2;
/** 转码输出默认目录 */
const OUTPUT_DIR = `${VIBEOS_APP_DIR}/transcode`;
/** 转码超时（24 小时） */
const TRANSCODE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** 内存任务存储 */
const tasks = new Map<string, TranscodeTask>();
/** 当前运行中任务数 */
let runningCount = 0;

/**
 * 预设对应的 ffmpeg 视频参数
 */
function getPresetArgs(preset: TranscodePreset): string[] {
  switch (preset) {
    case '1080p':
      return ['-vf', 'scale=-2:1080', '-b:v', '5M'];
    case '720p':
      return ['-vf', 'scale=-2:720', '-b:v', '3M'];
    case '480p':
      return ['-vf', 'scale=-2:480', '-b:v', '1.5M'];
    case 'original':
      return ['-c:v', 'copy'];
  }
}

/**
 * 硬件加速对应的 ffmpeg 编码器参数
 */
function getHwAccelArgs(hwAccel: HwAccelType, preset: TranscodePreset): string[] {
  if (preset === 'original') return [];

  switch (hwAccel) {
    case 'vaapi':
      return ['-vaapi_device', '/dev/dri/renderD128', '-c:v', 'h264_vaapi'];
    case 'nvenc':
      return ['-c:v', 'h264_nvenc'];
    case 'auto':
    case 'none':
      return ['-c:v', 'libx264'];
  }
}

/**
 * 构建 ffmpeg 命令参数
 */
function buildFfmpegArgs(task: TranscodeTask): string[] {
  const args: string[] = ['-y', '-i', task.inputPath];

  if (task.preset === 'original') {
    args.push('-c', 'copy');
  } else {
    args.push(...getHwAccelArgs(task.hwAccel, task.preset));
    args.push(...getPresetArgs(task.preset));
    args.push('-c:a', 'aac', '-b:a', '128k');
  }

  // 进度输出到 stderr（默认行为）
  args.push('-progress', 'pipe:1', task.outputPath);
  return args;
}

/**
 * 处理队列：启动排队中的任务
 */
function processQueue(): void {
  while (runningCount < MAX_CONCURRENT) {
    // 找到最早的 queued 任务
    let nextTask: TranscodeTask | null = null;
    for (const task of tasks.values()) {
      if (task.status === 'queued') {
        if (!nextTask || task.createdAt < nextTask.createdAt) {
          nextTask = task;
        }
      }
    }

    if (!nextTask) break;

    runningCount++;
    nextTask.status = 'running';
    nextTask.startedAt = new Date().toISOString();

    // 异步执行转码（fire-and-forget）
    runTranscode(nextTask).catch(() => {
      // 错误已在 runTranscode 内处理
    });
  }
}

/**
 * 执行单个转码任务
 */
async function runTranscode(task: TranscodeTask): Promise<void> {
  try {
    const args = buildFfmpegArgs(task);
    const result = await executeCommand('ffmpeg', args, TRANSCODE_TIMEOUT_MS);

    if (result.exitCode !== 0) {
      task.status = 'failed';
      task.error = result.stderr.slice(-500) || `ffmpeg 退出码 ${result.exitCode}`;
    } else {
      task.status = 'completed';
      task.progress = 100;
    }
  } catch (err) {
    task.status = 'failed';
    task.error = err instanceof Error ? err.message : String(err);
  } finally {
    task.finishedAt = new Date().toISOString();
    runningCount--;
    processQueue();
  }
}

/**
 * 获取所有转码任务列表
 */
export function listTasks(): TranscodeTask[] {
  return Array.from(tasks.values()).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * 创建转码任务
 */
export async function createTask(req: CreateTranscodeRequest): Promise<TranscodeResult> {
  const id = crypto.randomUUID().slice(0, 8);

  // 确定输出路径
  let outputPath = req.outputPath;
  if (!outputPath) {
    await ensureDir(OUTPUT_DIR);
    const ext = path.extname(req.inputPath) || '.mp4';
    const base = path.basename(req.inputPath, ext);
    outputPath = `${OUTPUT_DIR}/${base}_${req.preset}${ext}`;
  }

  const hwAccel: HwAccelType = req.hwAccel ?? 'auto';

  const task: TranscodeTask = {
    id,
    inputPath: req.inputPath,
    outputPath,
    preset: req.preset,
    hwAccel,
    status: 'queued',
    progress: 0,
    createdAt: new Date().toISOString(),
  };

  tasks.set(id, task);

  // 尝试启动队列
  processQueue();

  return {
    taskId: id,
    message: `转码任务已创建: ${req.inputPath} → ${outputPath} (${req.preset})`,
  };
}

/**
 * 获取任务详情
 */
export function getTask(id: string): TranscodeTask {
  const task = tasks.get(id);
  if (!task) {
    throw AppError.notFound(`转码任务 ${id}`);
  }
  return task;
}

/**
 * 取消/删除任务
 */
export function deleteTask(id: string): TranscodeResult {
  const task = tasks.get(id);
  if (!task) {
    throw AppError.notFound(`转码任务 ${id}`);
  }

  const wasRunning = task.status === 'running';

  if (wasRunning) {
    // 标记为取消（ffmpeg 进程会在完成后检测到状态变化）
    task.status = 'cancelled';
    task.finishedAt = new Date().toISOString();
    runningCount--;
    processQueue();
  } else if (task.status === 'queued') {
    task.status = 'cancelled';
    task.finishedAt = new Date().toISOString();
  }

  // 从存储中移除非运行中的任务
  if (!wasRunning) {
    tasks.delete(id);
  }

  return {
    taskId: id,
    message: `转码任务已${wasRunning ? '取消' : '删除'}: ${id}`,
  };
}

/**
 * 检测可用硬件加速
 */
export async function detectHwAccel(): Promise<HwAccelInfo> {
  let vaapi = false;
  let nvenc = false;
  const details: string[] = [];

  // 检测 VAAPI
  try {
    const result = await executeCommand('vainfo', []);
    if (result.exitCode === 0 && result.stdout.includes('VA-API')) {
      vaapi = true;
      details.push('VAAPI: 可用');
    } else {
      details.push('VAAPI: 不可用');
    }
  } catch {
    details.push('VAAPI: 未安装');
  }

  // 检测 NVENC
  try {
    const result = await executeCommand('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader']);
    if (result.exitCode === 0 && result.stdout.trim()) {
      nvenc = true;
      details.push(`NVENC: 可用 (${result.stdout.trim().split('\n')[0]})`);
    } else {
      details.push('NVENC: 不可用');
    }
  } catch {
    details.push('NVENC: 未安装');
  }

  const available: HwAccelType[] = ['none'];
  if (vaapi) available.unshift('vaapi');
  if (nvenc) available.unshift('nvenc');
  available.unshift('auto');

  return {
    vaapi,
    nvenc,
    available,
    details: details.join('; '),
  };
}

/**
 * 重置内部状态（仅用于测试）
 */
export function _resetForTesting(): void {
  tasks.clear();
  runningCount = 0;
}
