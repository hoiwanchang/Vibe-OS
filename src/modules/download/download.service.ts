/**
 * 模块：下载中心 — 业务逻辑层
 * 通过 aria2 JSON-RPC (HTTP) 通信
 */
import { AppError } from '../../common/app-error.js';
import type { DownloadTask } from './download.types.js';

const ARIA2_RPC_URL = process.env['NAISYS_ARIA2_RPC'] ?? 'http://127.0.0.1:6800/jsonrpc';
const ARIA2_SECRET = process.env['NAISYS_ARIA2_SECRET'] ?? '';

let rpcId = 0;

/** 调用 aria2 JSON-RPC */
async function rpcCall(method: string, params: unknown[] = []): Promise<unknown> {
  const allParams = ARIA2_SECRET ? [`token:${ARIA2_SECRET}`, ...params] : params;
  let response: Response;
  try {
    response = await fetch(ARIA2_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: String(++rpcId), method, params: allParams }),
    });
  } catch {
    throw new AppError(503, 'ARIA2_NOT_RUNNING', 'aria2 未运行或不可达');
  }
  const data = await response.json() as { result?: unknown; error?: { message?: string } };
  if (data.error) {
    throw new AppError(502, 'ARIA2_RPC_ERROR', data.error.message ?? 'aria2 RPC 错误');
  }
  return data.result;
}

/** 安全提取字符串值 */
function str(raw: Record<string, string>, key: string, fallback = ''): string {
  return raw[key] ?? fallback;
}

/** 将 aria2 原始数据转为 DownloadTask */
function parseTask(raw: Record<string, string>): DownloadTask {
  const total = parseInt(str(raw, 'totalLength', '0'), 10);
  const completed = parseInt(str(raw, 'completedLength', '0'), 10);
  const speed = parseInt(str(raw, 'downloadSpeed', '0'), 10);
  const rawFiles = raw['files'];
  let files: Array<{ path: string; length: number; completedLength: number }> = [];
  if (Array.isArray(rawFiles)) {
    files = (rawFiles as Array<Record<string, string>>).map((f) => ({
      path: f['path'] ?? '',
      length: parseInt(f['length'] ?? '0', 10),
      completedLength: parseInt(f['completedLength'] ?? '0', 10),
    }));
  }
  const gid = str(raw, 'gid');
  const firstPath = files[0]?.path ?? '';
  const name = firstPath ? firstPath.split('/').pop() ?? gid : gid;

  return {
    gid,
    name,
    status: str(raw, 'status', 'waiting') as DownloadTask['status'],
    totalBytes: total,
    completedBytes: completed,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    downloadSpeed: speed,
    uploadSpeed: parseInt(str(raw, 'uploadSpeed', '0'), 10),
    connections: parseInt(str(raw, 'connections', '0'), 10),
    eta: speed > 0 ? Math.round((total - completed) / speed) : null,
    dir: str(raw, 'dir'),
    files,
    error: raw['errorMessage'] || undefined,
    startedAt: '',
    completedAt: null,
  };
}

/** 列出所有下载任务 */
export async function listTasks(): Promise<DownloadTask[]> {
  const [active, waiting, stopped] = await Promise.all([
    rpcCall('aria2.tellActive') as Promise<Array<Record<string, string>>>,
    rpcCall('aria2.tellWaiting', [0, 100]) as Promise<Array<Record<string, string>>>,
    rpcCall('aria2.tellStopped', [0, 100]) as Promise<Array<Record<string, string>>>,
  ]);
  return [...active, ...waiting, ...stopped].map((r) => parseTask(r));
}

/** 添加下载任务 */
export async function addTask(urls: string[], targetDir?: string, headers?: Record<string, string>): Promise<string[]> {
  const opts: Record<string, string> = {};
  if (targetDir) opts['dir'] = targetDir;
  if (headers) {
    opts['header'] = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n');
  }
  const gid = await rpcCall('aria2.addUri', [urls, opts]) as string;
  return [gid];
}

/** 删除/停止任务 */
export async function removeTask(gid: string): Promise<string> {
  try {
    await rpcCall('aria2.remove', [gid]);
  } catch {
    await rpcCall('aria2.removeDownloadResult', [gid]);
  }
  return gid;
}

/** 暂停任务 */
export async function pauseTask(gid: string): Promise<string> {
  await rpcCall('aria2.pause', [gid]);
  return gid;
}

/** 恢复任务 */
export async function resumeTask(gid: string): Promise<string> {
  await rpcCall('aria2.unpause', [gid]);
  return gid;
}

/** 单任务详情 */
export async function getTask(gid: string): Promise<DownloadTask> {
  const result = await rpcCall('aria2.tellStatus', [gid]) as Record<string, string>;
  return parseTask(result);
}

/** 获取全局设置 */
export async function getSettings(): Promise<Record<string, string>> {
  return await rpcCall('aria2.getGlobalOption') as Record<string, string>;
}

/** 修改全局设置 */
export async function updateSettings(settings: Record<string, string>): Promise<string[]> {
  await rpcCall('aria2.changeGlobalOption', [settings]);
  return Object.keys(settings);
}
