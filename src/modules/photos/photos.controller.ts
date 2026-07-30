/**
 * 模块：照片管理 — 控制器
 */
import type { Request, Response } from 'express';
import * as service from './photos.service.js';
import type { CreateAlbumRequest, AddPhotosRequest, CreateShareRequest } from './photos.types.js';

/** GET /api/photos/library — 照片库（时间线） */
export function handleGetLibrary(req: Request, res: Response): void {
  const year = req.query['year'] ? Number(req.query['year']) : undefined;
  const month = req.query['month'] ? Number(req.query['month']) : undefined;
  const groups = service.getLibrary({ year, month });
  res.json({ success: true, data: groups });
}

/** GET /api/photos/albums — 相册列表 */
export async function handleGetAlbums(_req: Request, res: Response): Promise<void> {
  const albums = await service.listAlbums();
  res.json({ success: true, data: { albums } });
}

/** POST /api/photos/albums — 创建相册 */
export async function handleCreateAlbum(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateAlbumRequest;
  const album = await service.createAlbum(body.name, body.description);
  res.status(201).json({ success: true, data: { album } });
}

/** DELETE /api/photos/albums/:id — 删除相册 */
export async function handleDeleteAlbum(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  await service.deleteAlbum(id);
  res.json({ success: true, data: { removed: true } });
}

/** POST /api/photos/albums/:id/photos — 添加照片到相册 */
export async function handleAddPhotos(req: Request, res: Response): Promise<void> {
  const albumId = String(req.params['id'] ?? '');
  const body = req.body as AddPhotosRequest;
  const added = await service.addPhotosToAlbum(albumId, body.photoIds);
  res.json({ success: true, data: { added } });
}

/** GET /api/photos/:id — 照片详情 */
export function handleGetPhoto(req: Request, res: Response): void {
  const id = String(req.params['id'] ?? '');
  const photo = service.getPhoto(id);
  res.json({ success: true, data: { photo } });
}

/** GET /api/photos/:id/thumbnail — 缩略图 */
export async function handleGetThumbnail(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const thumbPath = await service.getThumbnailPath(id);
  res.sendFile(thumbPath);
}

/** GET /api/photos/:id/original — 原图 */
export function handleGetOriginal(req: Request, res: Response): void {
  const id = String(req.params['id'] ?? '');
  const originalPath = service.getOriginalPath(id);
  res.sendFile(originalPath);
}

/** POST /api/photos/share — 生成共享链接 */
export async function handleCreateShare(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateShareRequest;
  const share = await service.createShare(body.photoIds, body.expiresInHours);
  res.status(201).json({ success: true, data: { share } });
}

/** GET /api/photos/share/:token — 通过共享链接访问 */
export async function handleGetShare(req: Request, res: Response): Promise<void> {
  const token = String(req.params['token'] ?? '');
  const share = await service.getShare(token);
  const photos = share.photoIds.map((id) => service.getPhoto(id));
  res.json({ success: true, data: { photos } });
}
