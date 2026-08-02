/**
 * 模块：音乐串流 — 控制器层
 */
import type { Request, Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as service from './music.service.js';
import { AppError } from '../../common/app-error.js';

/** 解析分页参数 */
function parsePagination(query: Record<string, unknown>): { page: number; pageSize: number } {
  const rawPage = typeof query['page'] === 'string' ? query['page'] : '1';
  const rawPageSize = typeof query['pageSize'] === 'string' ? query['pageSize'] : '50';
  const page = Math.max(1, parseInt(rawPage, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(rawPageSize, 10) || 50));
  return { page, pageSize };
}

/** GET /api/music/library */
export async function handleGetLibrary(req: Request, res: Response): Promise<void> {
  const { page, pageSize } = parsePagination(req.query);
  const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
  const library = await service.getLibrary({ search, page, pageSize });
  res.json({ success: true, data: library });
}

/** GET /api/music/artists */
export async function handleListArtists(_req: Request, res: Response): Promise<void> {
  const artists = await service.listArtists();
  res.json({ success: true, data: { artists } });
}

/** GET /api/music/albums */
export async function handleListAlbums(_req: Request, res: Response): Promise<void> {
  const albums = await service.listAlbums();
  res.json({ success: true, data: { albums } });
}

/** GET /api/music/tracks */
export async function handleListTracks(req: Request, res: Response): Promise<void> {
  const { page, pageSize } = parsePagination(req.query);
  const artistId = typeof req.query['artistId'] === 'string' ? req.query['artistId'] : undefined;
  const albumId = typeof req.query['albumId'] === 'string' ? req.query['albumId'] : undefined;
  const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;
  const result = await service.listTracks({ artistId, albumId, search, page, pageSize });
  res.json({ success: true, data: result });
}

/** GET /api/music/tracks/:id/stream — 支持 Range 请求 */
export async function handleStreamTrack(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const { filePath, size } = await service.getTrackFilePath(id);

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
  };
  const contentType = mimeMap[ext] ?? 'application/octet-stream';

  const rangeHeader = req.headers['range'];
  if (rangeHeader) {
    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (!match) {
      throw AppError.badRequest('INVALID_RANGE', '无效的 Range 头');
    }
    const rawStart = match[1];
    const rawEnd = match[2];
    let start: number;
    let end: number;

    if (rawStart === '' && rawEnd) {
      // suffix range: bytes=-500
      const suffix = parseInt(rawEnd, 10);
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = parseInt(rawStart || '0', 10);
      end = rawEnd ? parseInt(rawEnd, 10) : size - 1;
    }

    if (start > end || start >= size) {
      res.setHeader('Content-Range', `bytes */${size}`);
      res.status(416).end();
      return;
    }
    end = Math.min(end, size - 1);
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunkSize);
    res.setHeader('Content-Type', contentType);

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
  } else {
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', size);
    res.setHeader('Content-Type', contentType);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}

/** GET /api/music/tracks/:id/cover */
export async function handleGetCover(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const { buffer, mimeType } = await service.getTrackCover(id);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
}

/** GET /api/music/playlists */
export async function handleListPlaylists(_req: Request, res: Response): Promise<void> {
  const playlists = await service.listPlaylists();
  res.json({ success: true, data: { playlists } });
}

/** POST /api/music/playlists */
export async function handleCreatePlaylist(req: Request, res: Response): Promise<void> {
  const body = req.body as { name: string; trackIds: string[] };
  const playlist = await service.createPlaylist(body);
  res.status(201).json({ success: true, data: { playlist } });
}

/** DELETE /api/music/playlists/:id */
export async function handleDeletePlaylist(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const removed = await service.deletePlaylist(id);
  res.json({ success: true, data: { removed } });
}

/** PUT /api/music/playlists/:id */
export async function handleUpdatePlaylist(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const body = req.body as { name?: string; addTrackIds?: string[]; removeTrackIds?: string[] };
  const playlist = await service.updatePlaylist(id, body);
  res.json({ success: true, data: { playlist } });
}

/** POST /api/music/scan — 触发音乐库扫描 */
export async function handleScan(_req: Request, res: Response): Promise<void> {
  service.invalidateCache();
  const tracks = await service.scanLibrary();
  res.json({ success: true, data: { scanned: tracks.length } });
}
