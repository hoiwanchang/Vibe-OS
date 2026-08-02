/**
 * 模块：回收站策略 — 业务逻辑层
 * 配置持久化到 JSON 文件，文件系统操作通过 executeCommand 执行
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { VIBEOS_APP_DIR, DATA_ROOT } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import { executeCommand } from '../../system/command-executor.js';
import { AppError } from '../../common/app-error.js';
import type {
  RecycleBinConfig,
  ShareRecycleBinConfig,
  UpdateRecycleBinConfigRequest,
  RecycleBinFile,
  RecycleBinStats,
  ShareRecycleBinStats,
  RestoreResult,
  EmptyResult,
} from './recyclebin.types.js';

const RECYCLEBIN_DIR = path.join(VIBEOS_APP_DIR, 'recyclebin');
const CONFIG_FILE = path.join(RECYCLEBIN_DIR, 'config.json');

/** 回收站根目录（存放已删除文件） */
const TRASH_ROOT = path.join(DATA_ROOT, '.recyclebin');

/** 默认配置 */
const DEFAULT_CONFIG: RecycleBinConfig = {
  shares: [],
};

/** 生成文件 ID（基于路径的 SHA-256 前 16 位） */
function generateFileId(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

/** 读取配置（不存在则返回默认值） */
async function loadConfig(): Promise<RecycleBinConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<RecycleBinConfig>;
    if (!Array.isArray(parsed.shares)) {
      return { ...DEFAULT_CONFIG };
    }
    // 校验并规范化每个共享文件夹配置
    const shares: ShareRecycleBinConfig[] = parsed.shares.map((s) => ({
      shareName: typeof s.shareName === 'string' ? s.shareName : '',
      enabled: typeof s.enabled === 'boolean' ? s.enabled : false,
      retentionDays: typeof s.retentionDays === 'number' ? s.retentionDays : 0,
      maxSizeBytes: typeof s.maxSizeBytes === 'number' ? s.maxSizeBytes : 0,
      excludeExtensions: Array.isArray(s.excludeExtensions)
        ? s.excludeExtensions.filter((e): e is string => typeof e === 'string')
        : [],
      excludePaths: Array.isArray(s.excludePaths)
        ? s.excludePaths.filter((p): p is string => typeof p === 'string')
        : [],
    }));
    return { shares };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 保存配置 */
async function saveConfig(cfg: RecycleBinConfig): Promise<void> {
  await ensureDir(RECYCLEBIN_DIR);
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

/** 获取共享文件夹的回收站目录（含路径穿越防护） */
function getShareTrashDir(shareName: string): string {
  // [安全加固] shareName 不得包含路径分隔符或 ..，防止穿越到 TRASH_ROOT 外
  if (/[/\\]|\.\./.test(shareName)) {
    throw AppError.badRequest('INVALID_SHARE', `共享文件夹名非法: ${shareName}`);
  }
  return path.join(TRASH_ROOT, shareName);
}

/** 解析 find 输出为文件条目列表 */
function parseFindOutput(
  output: string,
  shareName: string,
): RecycleBinFile[] {
  const files: RecycleBinFile[] = [];
  const shareTrashDir = getShareTrashDir(shareName);

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // find -printf 格式: size\ttime\tpath
    const parts = trimmed.split('\t');
    if (parts.length < 3) continue;

    const sizeBytes = parseInt(parts[0] ?? '0', 10);
    const timestamp = parts[1] ?? '';
    const filePath = parts.slice(2).join('\t');

    // 从回收站路径推算原始路径
    const relativePath = path.relative(shareTrashDir, filePath);
    const originalPath = path.join(DATA_ROOT, shareName, relativePath);

    files.push({
      id: generateFileId(filePath),
      originalPath,
      currentPath: filePath,
      shareName,
      sizeBytes: Number.isNaN(sizeBytes) ? 0 : sizeBytes,
      deletedAt: timestamp
        ? new Date(parseInt(timestamp, 10) * 1000).toISOString()
        : new Date().toISOString(),
    });
  }

  return files;
}

/** GET /api/recyclebin/config — 获取回收站配置 */
export async function getConfig(): Promise<RecycleBinConfig> {
  return loadConfig();
}

/** PUT /api/recyclebin/config — 更新回收站配置 */
export async function updateConfig(
  req: UpdateRecycleBinConfigRequest,
): Promise<RecycleBinConfig> {
  const cfg: RecycleBinConfig = {
    shares: req.shares.map((s) => ({
      shareName: s.shareName,
      enabled: s.enabled,
      retentionDays: s.retentionDays,
      maxSizeBytes: s.maxSizeBytes,
      excludeExtensions: s.excludeExtensions,
      excludePaths: s.excludePaths,
    })),
  };
  await saveConfig(cfg);
  return cfg;
}

/** GET /api/recyclebin/files — 列出回收站文件 */
export async function listFiles(
  shareName?: string,
): Promise<RecycleBinFile[]> {
  const config = await loadConfig();
  const enabledShares = config.shares.filter((s) => s.enabled);

  if (shareName) {
    const shareCfg = enabledShares.find((s) => s.shareName === shareName);
    if (!shareCfg) {
      throw AppError.notFound(`共享文件夹 [${shareName}] 的回收站`);
    }
    return listShareFiles(shareCfg);
  }

  // 列出所有启用回收站的共享文件夹的文件
  const allFiles: RecycleBinFile[] = [];
  for (const share of enabledShares) {
    const files = await listShareFiles(share);
    allFiles.push(...files);
  }
  return allFiles;
}

/** 列出单个共享文件夹的回收站文件 */
async function listShareFiles(
  share: ShareRecycleBinConfig,
): Promise<RecycleBinFile[]> {
  const trashDir = getShareTrashDir(share.shareName);

  const result = await executeCommand('find', [
    trashDir,
    '-type',
    'f',
    '-printf',
    '%s\\t%T@\\t%p\\n',
  ]);

  if (result.exitCode !== 0) {
    // 目录可能不存在，返回空列表
    return [];
  }

  return parseFindOutput(result.stdout, share.shareName);
}

/** POST /api/recyclebin/restore/:id — 恢复文件 */
export async function restoreFile(id: string): Promise<RestoreResult> {
  const files = await listFiles();
  const file = files.find((f) => f.id === id);

  if (!file) {
    throw AppError.notFound(`回收站文件 [${id}]`);
  }

  // 确保目标目录存在（使用 fs.mkdir 代替 bash -c，避免命令注入）
  const targetDir = path.dirname(file.originalPath);
  await fs.mkdir(targetDir, { recursive: true });

  // 移动文件回原位
  const result = await executeCommand('mv', [
    file.currentPath,
    file.originalPath,
  ]);

  if (result.exitCode !== 0) {
    throw AppError.internal(
      `恢复文件失败: ${result.stderr || `退出码 ${result.exitCode}`}`,
    );
  }

  return {
    restored: true,
    restoredPath: file.originalPath,
  };
}

/** DELETE /api/recyclebin/empty — 清空回收站 */
export async function emptyRecycleBin(
  shareName?: string,
): Promise<EmptyResult> {
  const config = await loadConfig();
  const enabledShares = shareName
    ? config.shares.filter((s) => s.enabled && s.shareName === shareName)
    : config.shares.filter((s) => s.enabled);

  if (shareName && enabledShares.length === 0) {
    throw AppError.notFound(`共享文件夹 [${shareName}] 的回收站`);
  }

  let deletedCount = 0;
  let freedBytes = 0;

  for (const share of enabledShares) {
    const trashDir = getShareTrashDir(share.shareName);

    // 先统计文件数和大小
    const files = await listShareFiles(share);
    deletedCount += files.length;
    freedBytes += files.reduce((sum, f) => sum + f.sizeBytes, 0);

    // 清空回收站目录（使用 fs.rm 代替 bash -c，避免命令注入）
    await fs.rm(trashDir, { recursive: true, force: true });
    // 重新创建空目录
    await fs.mkdir(trashDir, { recursive: true });
  }

  return { deletedCount, freedBytes };
}

/** GET /api/recyclebin/stats — 回收站统计信息 */
export async function getStats(): Promise<RecycleBinStats> {
  const config = await loadConfig();
  const perShare: ShareRecycleBinStats[] = [];
  let totalFiles = 0;
  let totalSizeBytes = 0;

  for (const share of config.shares) {
    if (!share.enabled) {
      perShare.push({
        shareName: share.shareName,
        enabled: false,
        fileCount: 0,
        sizeBytes: 0,
      });
      continue;
    }

    const trashDir = getShareTrashDir(share.shareName);
    const result = await executeCommand('du', ['-sb', trashDir]);

    let sizeBytes = 0;
    if (result.exitCode === 0) {
      const bytesStr = result.stdout.split('\t')[0];
      sizeBytes = parseInt(bytesStr ?? '0', 10);
      if (Number.isNaN(sizeBytes)) sizeBytes = 0;
    }

    // 获取文件数
    const findResult = await executeCommand('find', [
      trashDir,
      '-type',
      'f',
    ]);
    const fileCount = findResult.exitCode === 0
      ? findResult.stdout.split('\n').filter((l) => l.trim()).length
      : 0;

    perShare.push({
      shareName: share.shareName,
      enabled: true,
      fileCount,
      sizeBytes,
    });

    totalFiles += fileCount;
    totalSizeBytes += sizeBytes;
  }

  return { totalFiles, totalSizeBytes, perShare };
}
