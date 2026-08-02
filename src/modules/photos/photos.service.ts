/**
 * 模块：照片管理 — 服务层
 * 照片扫描、EXIF 读取、缩略图生成、相册管理、共享链接
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DATA_ROOT, VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import { AppError } from '../../common/app-error.js';
import type {
  PhotoItem,
  PhotoTimelineGroup,
  PhotoAlbum,
  PhotoShareLink,
} from './photos.types.js';

const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
const THUMB_DIR = path.join(VIBEOS_APP_DIR, 'cache', 'thumbs');
const ALBUMS_FILE = path.join(VIBEOS_APP_DIR, 'photos', 'albums.json');
const SHARES_FILE = path.join(VIBEOS_APP_DIR, 'photos', 'shares.json');

/** 内存照片索引（扫描后填充） */
let photoIndex: PhotoItem[] = [];

/**
 * 扫描照片库
 * 从 DATA_ROOT 下递归扫描图片文件，读取基本元数据
 */
export async function scanLibrary(): Promise<PhotoItem[]> {
  photoIndex = [];
  await scanDir(DATA_ROOT);
  return photoIndex;
}

async function scanDir(dir: string): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDir(fullPath);
    } else if (entry.isFile() && PHOTO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const id = randomUUID();
      let width = 0;
      let height = 0;
      let takenAt: string | null = null;
      let camera: string | null = null;
      let gps: { lat: number; lng: number } | null = null;

      try {
        const stat = await fs.stat(fullPath);
        // 尝试用 exiftool 读取 EXIF（如果可用）
        const { executeCommand } = await import('../../system/command-executor.js');
        const result = await executeCommand('exiftool', ['-json', '-n', '-ImageWidth', '-ImageHeight', '-DateTimeOriginal', '-Model', '-GPSLatitude', '-GPSLongitude', fullPath]);
        if (result.exitCode === 0 && result.stdout.trim()) {
          const meta = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
          const m = meta[0];
          if (m) {
            width = Number(m['ImageWidth'] ?? 0);
            height = Number(m['ImageHeight'] ?? 0);
            takenAt = typeof m['DateTimeOriginal'] === 'string' ? m['DateTimeOriginal'] : null;
            camera = typeof m['Model'] === 'string' ? m['Model'] : null;
            const lat = Number(m['GPSLatitude'] ?? NaN);
            const lng = Number(m['GPSLongitude'] ?? NaN);
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
              gps = { lat, lng };
            }
          }
        }
        void stat;
      } catch {
        // exiftool 不可用时降级：无 EXIF
      }

      photoIndex.push({ id, path: fullPath, filename: entry.name, width, height, takenAt, camera, gps });
    }
  }
}

/**
 * 获取照片库（时间线分组）
 */
export function getLibrary(params?: { year?: number; month?: number }): PhotoTimelineGroup[] {
  let photos = photoIndex;
  if (params?.year) {
    photos = photos.filter((p) => p.takenAt?.startsWith(String(params.year)));
  }
  if (params?.month && params?.year) {
    const prefix = `${params.year}-${String(params.month).padStart(2, '0')}`;
    photos = photos.filter((p) => p.takenAt?.startsWith(prefix));
  }

  const groups = new Map<string, PhotoItem[]>();
  for (const photo of photos) {
    const date = photo.takenAt ? photo.takenAt.slice(0, 10) : 'unknown';
    const arr = groups.get(date) ?? [];
    arr.push(photo);
    groups.set(date, arr);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, photos: items }));
}

/**
 * 获取照片详情
 */
export function getPhoto(id: string): PhotoItem {
  const photo = photoIndex.find((p) => p.id === id);
  if (!photo) throw AppError.notFound(`照片 ${id}`);
  return photo;
}

/**
 * 获取缩略图路径（sharp 生成，缓存）
 */
export async function getThumbnailPath(id: string): Promise<string> {
  const photo = getPhoto(id);
  await ensureDir(THUMB_DIR);
  const thumbPath = path.join(THUMB_DIR, `${id}.webp`);

  try {
    await fs.access(thumbPath);
    return thumbPath;
  } catch {
    // 不存在，生成
  }

  try {
    const sharp = (await import('sharp')).default;
    await sharp(photo.path)
      .resize(300, 300, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(thumbPath);
  } catch {
    // sharp 不可用时返回原图路径
    return photo.path;
  }
  return thumbPath;
}

/**
 * 获取原图路径
 */
export function getOriginalPath(id: string): string {
  return getPhoto(id).path;
}

/* ---------- 相册 ---------- */

async function loadAlbums(): Promise<PhotoAlbum[]> {
  try {
    const raw = await fs.readFile(ALBUMS_FILE, 'utf-8');
    return JSON.parse(raw) as PhotoAlbum[];
  } catch {
    return [];
  }
}

async function saveAlbums(albums: PhotoAlbum[]): Promise<void> {
  await ensureDir(path.dirname(ALBUMS_FILE));
  await fs.writeFile(ALBUMS_FILE, JSON.stringify(albums, null, 2), 'utf-8');
}

export async function listAlbums(): Promise<PhotoAlbum[]> {
  return loadAlbums();
}

export async function createAlbum(name: string, description?: string): Promise<PhotoAlbum> {
  const albums = await loadAlbums();
  const album: PhotoAlbum = {
    id: randomUUID(),
    name,
    description: description ?? '',
    coverId: null,
    photoIds: [],
    createdAt: new Date().toISOString(),
  };
  albums.push(album);
  await saveAlbums(albums);
  return album;
}

export async function deleteAlbum(id: string): Promise<void> {
  const albums = await loadAlbums();
  const idx = albums.findIndex((a) => a.id === id);
  if (idx === -1) throw AppError.notFound(`相册 ${id}`);
  albums.splice(idx, 1);
  await saveAlbums(albums);
}

export async function addPhotosToAlbum(albumId: string, photoIds: string[]): Promise<number> {
  const albums = await loadAlbums();
  const album = albums.find((a) => a.id === albumId);
  if (!album) throw AppError.notFound(`相册 ${albumId}`);
  let added = 0;
  for (const pid of photoIds) {
    if (!album.photoIds.includes(pid)) {
      album.photoIds.push(pid);
      added++;
    }
  }
  if (!album.coverId && album.photoIds.length > 0) {
    album.coverId = album.photoIds[0] ?? null;
  }
  await saveAlbums(albums);
  return added;
}

/* ---------- 共享链接 ---------- */

async function loadShares(): Promise<PhotoShareLink[]> {
  try {
    const raw = await fs.readFile(SHARES_FILE, 'utf-8');
    return JSON.parse(raw) as PhotoShareLink[];
  } catch {
    return [];
  }
}

async function saveShares(shares: PhotoShareLink[]): Promise<void> {
  await ensureDir(path.dirname(SHARES_FILE));
  await fs.writeFile(SHARES_FILE, JSON.stringify(shares, null, 2), 'utf-8');
}

export async function createShare(photoIds: string[], expiresInHours: number): Promise<PhotoShareLink> {
  const shares = await loadShares();
  const share: PhotoShareLink = {
    token: randomUUID().replace(/-/g, '').slice(0, 16),
    photoIds,
    expiresAt: new Date(Date.now() + expiresInHours * 3600_000).toISOString(),
  };
  shares.push(share);
  await saveShares(shares);
  return share;
}

export async function getShare(token: string): Promise<PhotoShareLink> {
  const shares = await loadShares();
  const share = shares.find((s) => s.token === token);
  if (!share) throw AppError.notFound(`共享链接 ${token}`);
  if (new Date(share.expiresAt) < new Date()) {
    throw AppError.badRequest('SHARE_EXPIRED', '共享链接已过期');
  }
  return share;
}
