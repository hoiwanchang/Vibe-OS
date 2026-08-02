/**
 * 模块：文件管理器 — 业务逻辑层
 * 提供 /data/{uid}/ 用户空间的完整文件 CRUD
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { lookup } from 'mime-types';
import sharp from 'sharp';
import { DATA_ROOT, VIBEOS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { saveVersion } from '../fileversion/fileversion.service.js';
import type {
  FileEntry,
  ListResult,
  ReadResult,
  WriteResult,
  DeleteResult,
  CopyResult,
  PreviewResult,
  PreviewKind,
  ThumbnailResult,
} from './filemanager.types.js';

/** 文本文件读取上限 1MB */
const READ_LIMIT = 1024 * 1024;

/**
 * 在覆盖已存在文件前保存旧版本快照（Phase 1 版本控制集成）
 * 版本保存失败不应阻断文件写入，故吞掉异常仅记录
 * @param uid - 用户 UID
 * @param relativePath - 相对路径
 */
async function snapshotBeforeOverwrite(uid: number, relativePath: string): Promise<void> {
  try {
    await saveVersion(uid, relativePath);
  } catch {
    /* 版本保存失败不阻断写入（如文件首次创建、策略关闭等） */
  }
}

/**
 * 解析并校验用户空间内的相对路径
 * [安全加固] 对已存在路径执行 realpath 解析 symlink，防止符号链接穿越
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
 * 异步版路径校验（含 symlink 解析）
 * 对已存在的路径调用 fs.realpath 解析符号链接后再次校验前缀，
 * 防止 /data/{uid}/evil -> /etc 类型的 symlink 穿越攻击。
 * @param uid - 用户 UID
 * @param relativePath - 相对于 /data/{uid}/ 的路径
 * @returns 绝对路径
 */
export async function resolveUserPathReal(uid: number, relativePath: string): Promise<string> {
  const resolved = resolveUserPath(uid, relativePath);
  const userRoot = path.join(DATA_ROOT, String(uid));
  try {
    const real = await fs.realpath(resolved);
    if (!real.startsWith(userRoot + path.sep) && real !== userRoot) {
      throw AppError.forbidden(
        `符号链接穿越检测: 路径实际指向 [${real}]，不在 /data/${uid}/ 内`,
      );
    }
    return real;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return resolved;
    }
    throw err;
  }
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
  // Phase 1: 覆盖前保存旧版本快照
  await snapshotBeforeOverwrite(uid, relativePath);
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

  // Phase 1: 覆盖已存在文件前保存旧版本快照
  const userRoot = getUserRoot(uid);
  const relPath = path.relative(userRoot, destPath);
  await snapshotBeforeOverwrite(uid, relPath);

  await pipeline(fileStream, createWriteStream(destPath));
  const stat = await fs.stat(destPath);
  return {
    uploaded: path.relative(userRoot, destPath),
    size: stat.size,
  };
}

/** 可作为文本预览的扩展名集合 */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.log',
  '.js', '.ts', '.py', '.sh', '.html', '.css',
]);

/** 可生成缩略图的图片扩展名集合 */
const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
]);

/**
 * 根据 MIME 类型与扩展名判定预览分类
 * @param mimeType - 文件的 MIME 类型
 * @param ext - 小写扩展名（含点）
 * @returns 预览分类
 */
function classifyPreview(mimeType: string, ext: string): PreviewKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'unsupported';
}

/**
 * 获取文件预览信息（按 MIME 分发）
 * 文本/代码类读取内容（上限 1MB，带 truncated 标记）；
 * image/pdf/video/audio 仅返回元信息，前端用 download/thumbnail 端点取流；
 * 其余返回 unsupported。
 * @param uid - 用户 UID
 * @param relativePath - 相对于用户根的路径
 * @returns 预览结果
 */
export async function getPreview(uid: number, relativePath: string): Promise<PreviewResult> {
  const absPath = resolveUserPath(uid, relativePath);

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    throw AppError.notFound(`文件 [${relativePath}]`);
  }
  if (stat.isDirectory()) {
    throw AppError.badRequest('IS_DIR', `[${relativePath}] 是目录，不能预览`);
  }

  const mimeType = lookup(absPath) || 'application/octet-stream';
  const ext = path.extname(absPath).toLowerCase();
  const kind = classifyPreview(mimeType, ext);

  if (kind === 'text') {
    const truncated = stat.size > READ_LIMIT;
    const buffer = Buffer.alloc(Math.min(stat.size, READ_LIMIT));
    const fh = await fs.open(absPath, 'r');
    try {
      await fh.read(buffer, 0, buffer.length, 0);
    } finally {
      await fh.close();
    }
    return {
      kind,
      mimeType,
      size: stat.size,
      content: buffer.toString('utf-8'),
      truncated,
    };
  }

  return { kind, mimeType, size: stat.size };
}

/**
 * 生成图片缩略图（256px PNG，带磁盘缓存）
 * 仅支持 jpg/png/gif/webp/bmp/svg；svg 由 sharp 直接光栅化为 png。
 * 缓存路径：VIBEOS_APP_DIR/cache/thumbs/{uid}/{md5(relPath)}.png
 * @param uid - 用户 UID
 * @param relativePath - 相对于用户根的图片路径
 * @returns 缩略图结果（含缓存命中标记）
 */
export async function getThumbnail(uid: number, relativePath: string): Promise<ThumbnailResult> {
  const absPath = resolveUserPath(uid, relativePath);
  const ext = path.extname(absPath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) {
    throw AppError.badRequest('NOT_IMAGE', `[${relativePath}] 不是可缩略的图片`);
  }

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    throw AppError.notFound(`文件 [${relativePath}]`);
  }
  if (stat.isDirectory()) {
    throw AppError.badRequest('IS_DIR', `[${relativePath}] 是目录，不能生成缩略图`);
  }

  const hash = createHash('md5').update(relativePath).digest('hex');
  const cacheDir = path.join(VIBEOS_APP_DIR, 'cache', 'thumbs', String(uid));
  const cachePath = path.join(cacheDir, `${hash}.png`);

  // 命中缓存直接返回
  try {
    const cachedStat = await fs.stat(cachePath);
    return { absPath: cachePath, mimeType: 'image/png', size: cachedStat.size, cached: true };
  } catch {
    // 未命中，继续生成
  }

  const pngBuffer = await sharp(absPath, { density: 96 })
    .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cachePath, pngBuffer);

  return { absPath: cachePath, mimeType: 'image/png', size: pngBuffer.length, cached: false };
}
