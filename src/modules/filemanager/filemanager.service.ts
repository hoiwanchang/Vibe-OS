/**
 * 模块：文件管理器 — 业务逻辑层
 * 提供 /data/{uid}/ 用户空间的完整文件 CRUD
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { lookup } from 'mime-types';
import { DATA_ROOT } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import type {
  FileEntry,
  ListResult,
  ReadResult,
  WriteResult,
  DeleteResult,
  CopyResult,
} from './filemanager.types.js';

/** 文本文件读取上限 1MB */
const READ_LIMIT = 1024 * 1024;

/**
 * 解析并校验用户空间内的相对路径
 * @param uid - 用户 UID
 * @param relativePath - 相对于 /data/{uid}/ 的路径
 * @returns 绝对路径
 */
export function resolveUserPath(uid: number, relativePath: string): string {
  const userRoot = path.join(DATA_ROOT, String(uid));
  const resolved = path.resolve(userRoot, relativePath);

  // 前缀校验：必须在用户目录内
  if (!resolved.startsWith(userRoot + path.sep) && resolved !== userRoot) {
    throw AppError.forbidden(
      `路径穿越检测: 路径不在 /data/${uid}/ 内`,
    );
  }

  // 禁止访问 .trash 以外的隐藏系统目录（如 .ssh）
  const rel = path.relative(userRoot, resolved);
  if (rel.startsWith('..')) {
    throw AppError.forbidden('路径穿越检测');
  }

  return resolved;
}

/**
 * 获取用户根目录
 */
function getUserRoot(uid: number): string {
  return path.join(DATA_ROOT, String(uid));
}

/**
 * 获取回收站路径
 */
function getTrashDir(uid: number): string {
  return path.join(DATA_ROOT, String(uid), '.trash');
}

/**
 * 将 stat 模式转为 rwx 字符串
 */
function modeToPermissions(mode: number): string {
  const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  const owner = perms[(mode >> 6) & 7] ?? '---';
  const group = perms[(mode >> 3) & 7] ?? '---';
  const other = perms[mode & 7] ?? '---';
  return owner + group + other;
}

/**
 * 列出目录内容
 */
export async function listDir(uid: number, relativePath: string): Promise<ListResult> {
  const absPath = resolveUserPath(uid, relativePath);

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    throw AppError.notFound(`目录 [${relativePath || '/'}]`);
  }
  if (!stat.isDirectory()) {
    throw AppError.badRequest('NOT_DIR', `[${relativePath}] 不是目录`);
  }

  const items = await fs.readdir(absPath, { withFileTypes: true });
  const userRoot = getUserRoot(uid);
  const entries: FileEntry[] = [];

  for (const item of items) {
    const itemPath = path.join(absPath, item.name);
    try {
      const itemStat = await fs.lstat(itemPath);
      const relPath = path.relative(userRoot, itemPath);
      let type: FileEntry['type'] = 'file';
      if (item.isSymbolicLink()) type = 'symlink';
      else if (item.isDirectory()) type = 'directory';

      entries.push({
        name: item.name,
        path: relPath,
        type,
        size: type === 'directory' ? 0 : itemStat.size,
        modifiedAt: itemStat.mtime.toISOString(),
        permissions: modeToPermissions(itemStat.mode),
        mimeType: type === 'file' ? (lookup(item.name) || 'application/octet-stream') : undefined,
      });
    } catch {
      // 跳过无法访问的条目
    }
  }

  return { entries, path: relativePath || '', total: entries.length };
}

/**
 * 读取文本文件（限制 1MB）
 */
export async function readFile(uid: number, relativePath: string): Promise<ReadResult> {
  const absPath = resolveUserPath(uid, relativePath);

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    throw AppError.notFound(`文件 [${relativePath}]`);
  }
  if (stat.isDirectory()) {
    throw AppError.badRequest('IS_DIR', `[${relativePath}] 是目录，不能读取`);
  }

  const truncated = stat.size > READ_LIMIT;
  const buffer = Buffer.alloc(Math.min(stat.size, READ_LIMIT));
  const fh = await fs.open(absPath, 'r');
  try {
    await fh.read(buffer, 0, buffer.length, 0);
  } finally {
    await fh.close();
  }

  return {
    content: buffer.toString('utf-8'),
    size: stat.size,
    truncated,
    mimeType: lookup(absPath) || 'application/octet-stream',
  };
}

/**
 * 创建目录（递归）
 */
export async function mkdir(uid: number, relativePath: string): Promise<string> {
  const absPath = resolveUserPath(uid, relativePath);
  await fs.mkdir(absPath, { recursive: true });
  return relativePath;
}

/**
 * 写入/覆盖文本文件
 */
export async function writeFile(uid: number, relativePath: string, content: string): Promise<WriteResult> {
  const absPath = resolveUserPath(uid, relativePath);
  // 确保父目录存在
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content, 'utf-8');
  const stat = await fs.stat(absPath);
  return { written: relativePath, size: stat.size };
}

/**
 * 重命名/移动
 */
export async function rename(uid: number, relativePath: string, newName: string): Promise<{ from: string; to: string }> {
  const absPath = resolveUserPath(uid, relativePath);
  const dir = path.dirname(absPath);
  const newPath = path.join(dir, newName);

  // 校验新路径也在用户目录内
  resolveUserPath(uid, path.relative(getUserRoot(uid), newPath));

  try {
    await fs.access(absPath);
  } catch {
    throw AppError.notFound(`文件 [${relativePath}]`);
  }

  await fs.rename(absPath, newPath);
  const userRoot = getUserRoot(uid);
  return {
    from: relativePath,
    to: path.relative(userRoot, newPath),
  };
}

/**
 * 删除文件/目录
 */
export async function deleteFile(uid: number, relativePath: string, permanent: boolean): Promise<DeleteResult> {
  const absPath = resolveUserPath(uid, relativePath);

  try {
    await fs.access(absPath);
  } catch {
    throw AppError.notFound(`文件 [${relativePath}]`);
  }

  if (permanent) {
    await fs.rm(absPath, { recursive: true, force: true });
    return { deleted: relativePath, method: 'permanent' };
  }

  // 移动到回收站，保留相对路径结构
  const trashDir = getTrashDir(uid);
  const trashTarget = path.join(trashDir, relativePath);
  await fs.mkdir(path.dirname(trashTarget), { recursive: true });
  await fs.rename(absPath, trashTarget);
  return { deleted: relativePath, method: 'trash' };
}

/**
 * 复制文件/目录
 */
export async function copyFile(uid: number, src: string, dest: string): Promise<CopyResult> {
  const absSrc = resolveUserPath(uid, src);
  const absDest = resolveUserPath(uid, dest);

  try {
    await fs.access(absSrc);
  } catch {
    throw AppError.notFound(`源文件 [${src}]`);
  }

  await fs.mkdir(path.dirname(absDest), { recursive: true });
  await fs.cp(absSrc, absDest, { recursive: true });
  return { copied: src, dest };
}

/**
 * 列出回收站内容
 */
export async function listTrash(uid: number): Promise<ListResult> {
  const trashDir = getTrashDir(uid);
  try {
    await fs.access(trashDir);
  } catch {
    return { entries: [], path: '.trash', total: 0 };
  }

  const items = await fs.readdir(trashDir, { withFileTypes: true });
  const entries: FileEntry[] = [];
  for (const item of items) {
    const itemPath = path.join(trashDir, item.name);
    try {
      const itemStat = await fs.lstat(itemPath);
      entries.push({
        name: item.name,
        path: `.trash/${item.name}`,
        type: item.isDirectory() ? 'directory' : 'file',
        size: item.isDirectory() ? 0 : itemStat.size,
        modifiedAt: itemStat.mtime.toISOString(),
        permissions: modeToPermissions(itemStat.mode),
      });
    } catch {
      // skip
    }
  }
  return { entries, path: '.trash', total: entries.length };
}

/**
 * 清空回收站
 */
export async function emptyTrash(uid: number): Promise<void> {
  const trashDir = getTrashDir(uid);
  await fs.rm(trashDir, { recursive: true, force: true });
  await fs.mkdir(trashDir, { recursive: true });
}

/**
 * 获取文件下载信息（异步 stat + 流）
 */
export async function getDownloadInfo(uid: number, relativePath: string): Promise<{ absPath: string; filename: string; size: number }> {
  const absPath = resolveUserPath(uid, relativePath);
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    throw AppError.notFound(`文件 [${relativePath}]`);
  }
  if (stat.isDirectory()) {
    throw AppError.badRequest('IS_DIR', '不能下载目录');
  }
  return { absPath, filename: path.basename(absPath), size: stat.size };
}

/**
 * 处理上传文件（流式写入）
 */
export async function handleUpload(
  uid: number,
  targetDir: string,
  filename: string,
  fileStream: NodeJS.ReadableStream,
): Promise<{ uploaded: string; size: number }> {
  const absDir = resolveUserPath(uid, targetDir);
  await fs.mkdir(absDir, { recursive: true });

  const destPath = path.join(absDir, filename);
  // 校验目标路径
  resolveUserPath(uid, path.relative(getUserRoot(uid), destPath));

  await pipeline(fileStream, createWriteStream(destPath));
  const stat = await fs.stat(destPath);
  const userRoot = getUserRoot(uid);
  return {
    uploaded: path.relative(userRoot, destPath),
    size: stat.size,
  };
}
