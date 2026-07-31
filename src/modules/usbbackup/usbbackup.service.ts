/**
 * 模块：USB 外设备份 — 业务逻辑层
 * USB 设备检测（lsblk）、备份策略管理、任务执行与状态、历史记录
 * 配置/历史持久化到 JSON 文件
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import { executeCommand } from '../../system/command-executor.js';
import { AppError } from '../../common/app-error.js';
import type {
  UsbDevice,
  UsbBackupConfig,
  UpdateUsbBackupConfigRequest,
  BackupTask,
  BackupHistoryEntry,
  ExecuteBackupRequest,
} from './usbbackup.types.js';

const USB_DIR = path.join(VIBEOS_APP_DIR, 'usbbackup');
const CONFIG_FILE = path.join(USB_DIR, 'config.json');
const HISTORY_FILE = path.join(USB_DIR, 'history.json');
const TASK_FILE = path.join(USB_DIR, 'task.json');

/** 默认配置 */
const DEFAULT_CONFIG: UsbBackupConfig = {
  strategy: 'rsync',
  sourcePath: '/data',
  targetPath: '',
  autoBackup: false,
  excludePatterns: [],
};

/** 历史记录最大保留条数 */
const MAX_HISTORY = 200;

// ===== 持久化辅助 =====

/** 读取配置（不存在则返回默认值） */
async function loadConfig(): Promise<UsbBackupConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UsbBackupConfig>;
    return {
      strategy:
        parsed.strategy === 'copy' ||
        parsed.strategy === 'rsync' ||
        parsed.strategy === 'bidirectional'
          ? parsed.strategy
          : DEFAULT_CONFIG.strategy,
      sourcePath:
        typeof parsed.sourcePath === 'string' && parsed.sourcePath.length > 0
          ? parsed.sourcePath
          : DEFAULT_CONFIG.sourcePath,
      targetPath:
        typeof parsed.targetPath === 'string'
          ? parsed.targetPath
          : DEFAULT_CONFIG.targetPath,
      autoBackup:
        typeof parsed.autoBackup === 'boolean'
          ? parsed.autoBackup
          : DEFAULT_CONFIG.autoBackup,
      excludePatterns: Array.isArray(parsed.excludePatterns)
        ? parsed.excludePatterns.filter((p): p is string => typeof p === 'string')
        : DEFAULT_CONFIG.excludePatterns,
    };
  } catch {
    return { ...DEFAULT_CONFIG, excludePatterns: [...DEFAULT_CONFIG.excludePatterns] };
  }
}

/** 保存配置 */
async function saveConfig(cfg: UsbBackupConfig): Promise<void> {
  await ensureDir(USB_DIR);
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

/** 读取历史记录 */
async function loadHistory(): Promise<BackupHistoryEntry[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BackupHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/** 追加历史记录 */
async function appendHistory(entry: BackupHistoryEntry): Promise<void> {
  await ensureDir(USB_DIR);
  const history = await loadHistory();
  history.push(entry);
  const trimmed =
    history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
  await fs.writeFile(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
}

/** 读取当前任务状态 */
async function loadTask(): Promise<BackupTask | null> {
  try {
    const raw = await fs.readFile(TASK_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'id' in parsed) {
      return parsed as BackupTask;
    }
    return null;
  } catch {
    return null;
  }
}

/** 保存当前任务状态 */
async function saveTask(task: BackupTask): Promise<void> {
  await ensureDir(USB_DIR);
  await fs.writeFile(TASK_FILE, JSON.stringify(task, null, 2), 'utf-8');
}

// ===== lsblk 解析 =====

/** lsblk -J 输出中的设备节点 */
interface LsblkNode {
  name?: string;
  label?: string | null;
  size?: string;
  type?: string;
  mountpoint?: string | null;
  fstype?: string | null;
  model?: string | null;
  vendor?: string | null;
  tran?: string | null;
  children?: LsblkNode[];
}

/** 将 lsblk JSON 节点转换为 UsbDevice */
function mapLsblkNode(node: LsblkNode): UsbDevice {
  return {
    name: node.name ?? '',
    label: node.label ?? null,
    size: node.size ?? '',
    type: node.type ?? '',
    mountpoint: node.mountpoint ?? null,
    fstype: node.fstype ?? null,
    model: node.model ?? null,
    vendor: node.vendor ?? null,
    tran: node.tran ?? null,
    children: (node.children ?? []).map(mapLsblkNode),
  };
}

/** 递归过滤仅保留 USB 传输设备 */
function filterUsbDevices(devices: UsbDevice[]): UsbDevice[] {
  return devices
    .filter((d) => d.tran === 'usb')
    .map((d) => ({ ...d, children: d.children }));
}

// ===== 公开 API =====

/** GET /api/usbbackup/devices — 检测 USB 设备 */
export async function getDevices(): Promise<UsbDevice[]> {
  const result = await executeCommand('lsblk', [
    '-J',
    '-o',
    'NAME,LABEL,SIZE,TYPE,MOUNTPOINT,FSTYPE,MODEL,VENDOR,TRAN',
  ]);

  if (result.exitCode !== 0) {
    throw AppError.internal(
      `无法检测设备: ${result.stderr || `退出码 ${result.exitCode}`}`,
    );
  }

  try {
    const parsed = JSON.parse(result.stdout) as { blockdevices?: LsblkNode[] };
    const allDevices = (parsed.blockdevices ?? []).map(mapLsblkNode);
    return filterUsbDevices(allDevices);
  } catch {
    throw AppError.internal('无法解析 lsblk 输出');
  }
}

/** GET /api/usbbackup/config — 获取备份配置 */
export async function getConfig(): Promise<UsbBackupConfig> {
  return loadConfig();
}

/** PUT /api/usbbackup/config — 更新备份配置 */
export async function updateConfig(
  req: UpdateUsbBackupConfigRequest,
): Promise<UsbBackupConfig> {
  const current = await loadConfig();
  const updated: UsbBackupConfig = {
    strategy: req.strategy ?? current.strategy,
    sourcePath: req.sourcePath ?? current.sourcePath,
    targetPath: req.targetPath ?? current.targetPath,
    autoBackup: req.autoBackup ?? current.autoBackup,
    excludePatterns: req.excludePatterns ?? current.excludePatterns,
  };
  await saveConfig(updated);
  return updated;
}

/** 构建 rsync 参数 */
function buildRsyncArgs(
  strategy: UsbBackupConfig['strategy'],
  source: string,
  target: string,
  excludePatterns: string[],
  reverse = false,
): string[] {
  const args: string[] = ['-a', '--stats'];

  if (strategy === 'rsync') {
    args.push('-z', '--delete');
  }
  // copy 策略：不加 --delete，仅单向复制
  // bidirectional 策略：不加 --delete，分两次执行

  for (const pattern of excludePatterns) {
    args.push('--exclude', pattern);
  }

  if (reverse) {
    // 确保路径以 / 结尾以同步内容而非目录本身
    const src = target.endsWith('/') ? target : `${target}/`;
    const dst = source.endsWith('/') ? source : `${source}/`;
    args.push(src, dst);
  } else {
    const src = source.endsWith('/') ? source : `${source}/`;
    const dst = target.endsWith('/') ? target : `${target}/`;
    args.push(src, dst);
  }

  return args;
}

/** 从 rsync --stats 输出中解析统计 */
function parseRsyncStats(stdout: string): {
  filesTransferred: number;
  bytesTransferred: number;
} {
  const filesMatch = stdout.match(
    /Number of regular files transferred:\s*([\d,]+)/,
  );
  const bytesMatch = stdout.match(
    /Total transferred file size:\s*([\d,]+)/,
  );
  return {
    filesTransferred: parseInt(
      (filesMatch?.[1] ?? '0').replace(/,/g, ''),
      10,
    ),
    bytesTransferred: parseInt(
      (bytesMatch?.[1] ?? '0').replace(/,/g, ''),
      10,
    ),
  };
}

/** POST /api/usbbackup/execute — 执行备份任务 */
export async function executeBackup(
  req: ExecuteBackupRequest,
): Promise<BackupTask> {
  // 检查是否有正在运行的任务
  const existing = await loadTask();
  if (existing && existing.status === 'running') {
    throw AppError.conflict('已有备份任务正在执行中');
  }

  const config = await loadConfig();
  const strategy = req.strategy ?? config.strategy;
  const source = req.sourcePath ?? config.sourcePath;
  const target = req.targetPath ?? config.targetPath;

  if (!source) {
    throw AppError.badRequest('INVALID_CONFIG', '源路径不能为空');
  }
  if (!target) {
    throw AppError.badRequest('INVALID_CONFIG', '目标路径不能为空');
  }

  const task: BackupTask = {
    id: randomUUID(),
    strategy,
    source,
    target,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    filesTransferred: 0,
    bytesTransferred: 0,
    error: null,
  };
  await saveTask(task);

  try {
    if (strategy === 'bidirectional') {
      // 双向同步：先正向再反向
      const fwdResult = await executeCommand(
        'rsync',
        buildRsyncArgs(strategy, source, target, config.excludePatterns),
        600_000,
      );
      if (fwdResult.exitCode !== 0) {
        throw AppError.commandFailed(
          'rsync',
          fwdResult.stderr || `正向同步失败，退出码 ${fwdResult.exitCode}`,
        );
      }
      const fwdStats = parseRsyncStats(fwdResult.stdout);

      const revResult = await executeCommand(
        'rsync',
        buildRsyncArgs(strategy, source, target, config.excludePatterns, true),
        600_000,
      );
      if (revResult.exitCode !== 0) {
        throw AppError.commandFailed(
          'rsync',
          revResult.stderr || `反向同步失败，退出码 ${revResult.exitCode}`,
        );
      }
      const revStats = parseRsyncStats(revResult.stdout);

      task.filesTransferred =
        fwdStats.filesTransferred + revStats.filesTransferred;
      task.bytesTransferred =
        fwdStats.bytesTransferred + revStats.bytesTransferred;
    } else {
      // copy / rsync 策略
      const result = await executeCommand(
        'rsync',
        buildRsyncArgs(strategy, source, target, config.excludePatterns),
        600_000,
      );
      if (result.exitCode !== 0) {
        throw AppError.commandFailed(
          'rsync',
          result.stderr || `退出码 ${result.exitCode}`,
        );
      }
      const stats = parseRsyncStats(result.stdout);
      task.filesTransferred = stats.filesTransferred;
      task.bytesTransferred = stats.bytesTransferred;
    }

    task.status = 'success';
  } catch (err) {
    task.status = 'failed';
    task.error = err instanceof Error ? err.message : String(err);
  }

  task.finishedAt = new Date().toISOString();
  await saveTask(task);

  // 写入历史
  await appendHistory({
    id: task.id,
    strategy: task.strategy,
    source: task.source,
    target: task.target,
    status: task.status === 'success' ? 'success' : 'failed',
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    filesTransferred: task.filesTransferred,
    bytesTransferred: task.bytesTransferred,
    error: task.error,
  });

  return task;
}

/** GET /api/usbbackup/status — 获取当前任务状态 */
export async function getStatus(): Promise<{
  task: BackupTask | null;
  running: boolean;
}> {
  const task = await loadTask();
  return {
    task,
    running: task?.status === 'running',
  };
}

/** GET /api/usbbackup/history — 获取备份历史 */
export async function getHistory(): Promise<BackupHistoryEntry[]> {
  return loadHistory();
}
