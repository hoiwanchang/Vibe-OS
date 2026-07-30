/**
 * 模块：文件管理器 — 控制器层
 */
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import * as service from './filemanager.service.js';

/** GET /api/files/list */
export async function handleList(req: Request, res: Response): Promise<void> {
  const uid = parseInt(String(req.query['uid'] as string ?? ''), 10);
  const path = String(req.query['path'] as string ?? '');
  const result = await service.listDir(uid, path);
  res.json({ success: true, data: result });
}

/** GET /api/files/read */
export async function handleRead(req: Request, res: Response): Promise<void> {
  const uid = parseInt(String(req.query['uid'] as string ?? ''), 10);
  const path = String(req.query['path'] as string ?? '');
  const result = await service.readFile(uid, path);
  res.json({ success: true, data: result });
}

/** POST /api/files/mkdir */
export async function handleMkdir(req: Request, res: Response): Promise<void> {
  const body = req.body as { path: string; uid: number };
  const created = await service.mkdir(body.uid, body.path);
  res.status(201).json({ success: true, data: { created } });
}

/** POST /api/files/write */
export async function handleWrite(req: Request, res: Response): Promise<void> {
  const body = req.body as { path: string; uid: number; content: string };
  const result = await service.writeFile(body.uid, body.path, body.content);
  res.json({ success: true, data: result });
}

/** POST /api/files/rename */
export async function handleRename(req: Request, res: Response): Promise<void> {
  const body = req.body as { path: string; newName: string; uid: number };
  const result = await service.rename(body.uid, body.path, body.newName);
  res.json({ success: true, data: result });
}

/** DELETE /api/files/delete */
export async function handleDelete(req: Request, res: Response): Promise<void> {
  const body = req.body as { path: string; uid: number; permanent?: boolean };
  const result = await service.deleteFile(body.uid, body.path, body.permanent ?? false);
  res.json({ success: true, data: result });
}

/** POST /api/files/copy */
export async function handleCopy(req: Request, res: Response): Promise<void> {
  const body = req.body as { src: string; dest: string; uid: number };
  const result = await service.copyFile(body.uid, body.src, body.dest);
  res.json({ success: true, data: result });
}

/** GET /api/files/download */
export async function handleDownload(req: Request, res: Response): Promise<void> {
  const uid = parseInt(String(req.query['uid'] as string ?? ''), 10);
  const path = String(req.query['path'] as string ?? '');
  const info = await service.getDownloadInfo(uid, path);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(info.filename)}"`);
  res.setHeader('Content-Length', info.size);
  const stream = createReadStream(info.absPath);
  stream.pipe(res);
}

/** POST /api/files/upload */
export async function handleUpload(req: Request, res: Response): Promise<void> {
  const uid = parseInt(String((req.body as Record<string, string>)?.uid ?? ''), 10);
  const targetDir = String((req.body as Record<string, string>)?.path ?? '');
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, error: { code: 'NO_FILE', message: '未上传文件' } });
    return;
  }
  const result = await service.handleUpload(uid, targetDir, file.originalname, file.stream);
  res.status(201).json({ success: true, data: result });
}

/** GET /api/files/trash */
export async function handleListTrash(req: Request, res: Response): Promise<void> {
  const uid = parseInt(String(req.query['uid'] as string ?? ''), 10);
  const result = await service.listTrash(uid);
  res.json({ success: true, data: result });
}

/** DELETE /api/files/trash/empty */
export async function handleEmptyTrash(req: Request, res: Response): Promise<void> {
  const uid = parseInt(String(req.query['uid'] as string ?? ''), 10);
  await service.emptyTrash(uid);
  res.json({ success: true, data: { emptied: true } });
}

/** GET /api/files/preview */
export async function handlePreview(req: Request, res: Response): Promise<void> {
  const uid = parseInt(String(req.query['uid'] as string ?? ''), 10);
  const path = String(req.query['path'] as string ?? '');
  const result = await service.getPreview(uid, path);
  res.json({ success: true, data: result });
}

/** GET /api/files/thumbnail */
export async function handleThumbnail(req: Request, res: Response): Promise<void> {
  const uid = parseInt(String(req.query['uid'] as string ?? ''), 10);
  const path = String(req.query['path'] as string ?? '');
  const result = await service.getThumbnail(uid, path);
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Content-Length', result.size);
  res.setHeader('X-Thumbnail-Cached', result.cached ? 'true' : 'false');
  res.sendFile(result.absPath);
}
