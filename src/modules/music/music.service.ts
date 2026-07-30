/**
 * 模块：音乐串流 — 业务逻辑层
 * 扫描 /data/ 下音频文件，读取元数据，管理播放列表
 */
import * as fs from 'node:fs/promises';
import * as fssync from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { parseFile } from 'music-metadata';
import { DATA_ROOT, VIBEOS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import type {
  Track,
  Artist,
  Album,
  Playlist,
  CreatePlaylistInput,
  UpdatePlaylistInput,
  LibraryView,
  PaginationParams,
  PaginatedResult,
} from './music.types.js';
import { AUDIO_EXTENSIONS } from './music.types.js';

const PLAYLISTS_FILE = `${VIBEOS_APP_DIR}/music/playlists.json`;

/** 曲目缓存（扫描后驻留内存） */
let trackCache: Track[] | null = null;

/** 由文件路径生成稳定 ID */
function trackId(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

/** 由名称生成稳定 ID（艺术家/专辑） */
function nameId(prefix: string, name: string): string {
  return `${prefix}_${createHash('sha256').update(name).digest('hex').slice(0, 12)}`;
}

/** 判断文件是否为音频 */
function isAudioFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return (AUDIO_EXTENSIONS as readonly string[]).includes(ext);
}

/** 递归扫描目录收集音频文件路径 */
async function collectAudioFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: fssync.Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 跳过隐藏目录和系统目录
      if (entry.name.startsWith('.') || entry.name === 'vibeos') continue;
      const sub = await collectAudioFiles(fullPath);
      results.push(...sub);
    } else if (entry.isFile() && isAudioFile(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** 读取单个音频文件元数据 */
async function readTrackMetadata(filePath: string): Promise<Track> {
  const id = trackId(filePath);
  const fallbackName = path.basename(filePath, path.extname(filePath));

  let title = fallbackName;
  let artist = '未知艺术家';
  let album = '未知专辑';
  let duration = 0;
  let trackNumber: number | null = null;
  let discNumber: number | null = null;
  let year: number | null = null;
  let genre: string | null = null;
  let format = path.extname(filePath).slice(1).toUpperCase();
  let bitrate: number | null = null;
  let sampleRate: number | null = null;
  let hasCover = false;

  try {
    const meta = await parseFile(filePath, { duration: true, skipCovers: false });
    const c = meta.common;
    title = c.title ?? fallbackName;
    artist = c.artist ?? '未知艺术家';
    album = c.album ?? '未知专辑';
    duration = meta.format.duration ?? 0;
    trackNumber = c.track?.no ?? null;
    discNumber = c.disk?.no ?? null;
    year = c.year ?? null;
    genre = c.genre?.[0] ?? null;
    format = meta.format.codec ?? meta.format.container ?? format;
    bitrate = meta.format.bitrate ?? null;
    sampleRate = meta.format.sampleRate ?? null;
    hasCover = (c.picture?.length ?? 0) > 0;
  } catch {
    // 元数据读取失败，使用回退值
  }

  // 检查目录中是否有 cover.jpg / cover.png
  if (!hasCover) {
    const dir = path.dirname(filePath);
    for (const coverName of ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg']) {
      try {
        await fs.access(path.join(dir, coverName));
        hasCover = true;
        break;
      } catch {
        // 不存在
      }
    }
  }

  let size = 0;
  try {
    const stat = await fs.stat(filePath);
    size = stat.size;
  } catch {
    // 忽略
  }

  return {
    id,
    title,
    artist,
    album,
    duration: Math.round(duration),
    trackNumber,
    discNumber,
    year,
    genre,
    format,
    bitrate,
    sampleRate,
    size,
    filePath,
    hasCover,
  };
}

/** 扫描音乐库（全量） */
export async function scanLibrary(): Promise<Track[]> {
  const files = await collectAudioFiles(DATA_ROOT);
  const tracks: Track[] = [];
  for (const f of files) {
    const t = await readTrackMetadata(f);
    tracks.push(t);
  }
  // 按艺术家 → 专辑 → 曲目号排序
  tracks.sort((a, b) =>
    a.artist.localeCompare(b.artist) ||
    a.album.localeCompare(b.album) ||
    (a.trackNumber ?? 999) - (b.trackNumber ?? 999),
  );
  trackCache = tracks;
  return tracks;
}

/** 获取所有曲目（带缓存） */
export async function getTracks(): Promise<Track[]> {
  if (!trackCache) {
    await scanLibrary();
  }
  return trackCache ?? [];
}

/** 强制刷新缓存 */
export function invalidateCache(): void {
  trackCache = null;
}

/** 分页工具 */
function paginate<T>(items: T[], params: PaginationParams): PaginatedResult<T> {
  const { page, pageSize } = params;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);
  return { items: paged, total, page, pageSize, totalPages };
}

/** 获取曲目列表（支持过滤 + 分页） */
export async function listTracks(opts: {
  artistId?: string;
  albumId?: string;
  search?: string;
  page: number;
  pageSize: number;
}): Promise<PaginatedResult<Track>> {
  let tracks = await getTracks();

  if (opts.artistId) {
    tracks = tracks.filter((t) => nameId('ar', t.artist) === opts.artistId);
  }
  if (opts.albumId) {
    tracks = tracks.filter((t) => nameId('al', `${t.artist}::${t.album}`) === opts.albumId);
  }
  if (opts.search) {
    const q = opts.search.toLowerCase();
    tracks = tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q),
    );
  }

  return paginate(tracks, { page: opts.page, pageSize: opts.pageSize });
}

/** 获取艺术家列表 */
export async function listArtists(): Promise<Artist[]> {
  const tracks = await getTracks();
  const map = new Map<string, Artist>();
  for (const t of tracks) {
    const id = nameId('ar', t.artist);
    const existing = map.get(id);
    if (existing) {
      existing.trackCount++;
      // 统计专辑数用 set 不方便，这里简单累加后去重
    } else {
      map.set(id, { id, name: t.artist, albumCount: 0, trackCount: 1 });
    }
  }
  // 计算每个艺术家的专辑数
  const albumSets = new Map<string, Set<string>>();
  for (const t of tracks) {
    const id = nameId('ar', t.artist);
    if (!albumSets.has(id)) albumSets.set(id, new Set());
    albumSets.get(id)!.add(t.album);
  }
  for (const [id, artist] of map) {
    artist.albumCount = albumSets.get(id)?.size ?? 0;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** 获取专辑列表 */
export async function listAlbums(): Promise<Album[]> {
  const tracks = await getTracks();
  const map = new Map<string, Album>();
  for (const t of tracks) {
    const id = nameId('al', `${t.artist}::${t.album}`);
    const existing = map.get(id);
    if (existing) {
      existing.trackCount++;
      if (!existing.hasCover && t.hasCover) existing.hasCover = true;
    } else {
      map.set(id, {
        id,
        name: t.album,
        artist: t.artist,
        year: t.year,
        trackCount: 1,
        hasCover: t.hasCover,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** 获取音乐库层级视图（支持搜索 + 分页） */
export async function getLibrary(opts: {
  search?: string;
  page: number;
  pageSize: number;
}): Promise<LibraryView> {
  const [artists, albums, tracksResult] = await Promise.all([
    listArtists(),
    listAlbums(),
    listTracks({ search: opts.search, page: opts.page, pageSize: opts.pageSize }),
  ]);

  // 搜索时过滤艺术家和专辑
  let filteredArtists = artists;
  let filteredAlbums = albums;
  if (opts.search) {
    const q = opts.search.toLowerCase();
    filteredArtists = artists.filter((a) => a.name.toLowerCase().includes(q));
    filteredAlbums = albums.filter(
      (a) => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q),
    );
  }

  return {
    artists: filteredArtists,
    albums: filteredAlbums,
    tracks: tracksResult.items,
    totalArtists: filteredArtists.length,
    totalAlbums: filteredAlbums.length,
    totalTracks: tracksResult.total,
  };
}

/** 根据 ID 查找曲目 */
export async function getTrackById(id: string): Promise<Track> {
  const tracks = await getTracks();
  const track = tracks.find((t) => t.id === id);
  if (!track) throw AppError.notFound(`曲目 [${id}]`);
  return track;
}

/** 获取曲目音频文件路径（用于 stream） */
export async function getTrackFilePath(id: string): Promise<{ filePath: string; size: number }> {
  const track = await getTrackById(id);
  try {
    const stat = await fs.stat(track.filePath);
    return { filePath: track.filePath, size: stat.size };
  } catch {
    throw AppError.notFound(`音频文件 [${track.filePath}]`);
  }
}

/** 获取曲目封面数据 */
export async function getTrackCover(id: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const track = await getTrackById(id);

  // 1. 尝试从 ID3 标签提取嵌入封面
  try {
    const meta = await parseFile(track.filePath, { skipCovers: false, duration: false });
    const pic = meta.common.picture?.[0];
    if (pic) {
      return {
        buffer: Buffer.from(pic.data),
        mimeType: pic.format ?? 'image/jpeg',
      };
    }
  } catch {
    // 继续尝试目录封面
  }

  // 2. 尝试目录中的封面文件
  const dir = path.dirname(track.filePath);
  const coverNames = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg'];
  for (const name of coverNames) {
    const coverPath = path.join(dir, name);
    try {
      const buffer = await fs.readFile(coverPath);
      const ext = path.extname(name).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
      return { buffer, mimeType };
    } catch {
      // 继续
    }
  }

  throw AppError.notFound(`曲目 [${id}] 的封面`);
}

// ===== 播放列表 =====

/** 读取播放列表 */
async function loadPlaylists(): Promise<Playlist[]> {
  try {
    const raw = await fs.readFile(PLAYLISTS_FILE, 'utf-8');
    return JSON.parse(raw) as Playlist[];
  } catch {
    return [];
  }
}

/** 保存播放列表 */
async function savePlaylists(playlists: Playlist[]): Promise<void> {
  await fs.mkdir(path.dirname(PLAYLISTS_FILE), { recursive: true });
  await fs.writeFile(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2), 'utf-8');
}

/** 列出所有播放列表 */
export async function listPlaylists(): Promise<Playlist[]> {
  return loadPlaylists();
}

/** 创建播放列表 */
export async function createPlaylist(input: CreatePlaylistInput): Promise<Playlist> {
  const playlists = await loadPlaylists();
  const now = new Date().toISOString();
  const playlist: Playlist = {
    id: createHash('sha256').update(`${input.name}:${now}`).digest('hex').slice(0, 12),
    name: input.name,
    trackIds: input.trackIds,
    createdAt: now,
    updatedAt: now,
  };
  playlists.push(playlist);
  await savePlaylists(playlists);
  return playlist;
}

/** 删除播放列表 */
export async function deletePlaylist(id: string): Promise<string> {
  const playlists = await loadPlaylists();
  const idx = playlists.findIndex((p) => p.id === id);
  if (idx === -1) throw AppError.notFound(`播放列表 [${id}]`);
  playlists.splice(idx, 1);
  await savePlaylists(playlists);
  return id;
}

/** 更新播放列表（重命名 / 增删曲目） */
export async function updatePlaylist(id: string, input: UpdatePlaylistInput): Promise<Playlist> {
  const playlists = await loadPlaylists();
  const idx = playlists.findIndex((p) => p.id === id);
  if (idx === -1) throw AppError.notFound(`播放列表 [${id}]`);

  const existing = playlists[idx];
  if (!existing) throw AppError.notFound(`播放列表 [${id}]`);

  if (input.name !== undefined) {
    existing.name = input.name;
  }
  if (input.addTrackIds) {
    const set = new Set(existing.trackIds);
    for (const tid of input.addTrackIds) set.add(tid);
    existing.trackIds = [...set];
  }
  if (input.removeTrackIds) {
    const removeSet = new Set(input.removeTrackIds);
    existing.trackIds = existing.trackIds.filter((tid) => !removeSet.has(tid));
  }
  existing.updatedAt = new Date().toISOString();
  playlists[idx] = existing;
  await savePlaylists(playlists);
  return existing;
}
