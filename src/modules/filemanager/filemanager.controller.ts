/**
 * 模块：文件管理器 — 控制器层
 * [安全加固] 所有操作强制校验 uid 授权：
 *   - 普通用户仅能访问自身 uid 的文件空间
 *   - admin 可访问任意用户空间
 */
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { AppError } from '../../common/app-error.js';
import * as service from './filemanager.service.js';

/**
 * 从请求中提取并校验目标 uid
 * 非 admin 用户只能操作自己的 uid 空间
 */
function assertUidAuthorized(req: Request, targetUid: number): void {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized();
  }
  // admin 可访问任意用户空间
  if (user.role === 'admin') return;
  // 普通用户仅能访问自身空间
  if (user.uid !== targetUid) {
    throw AppError.forbidden(
      `无权访问 uid=${targetUid} 的文件空间（当前用户 uid=${user.uid}）`,
    );
  }
}

/** 从 query 参数解析 uid 并校验授权 */
function resolveUidFromQuery(req: Request): number {
  const uid = parseInt(String(req.query['uid'] as string ?? ''), 10);
  if (Number.isNaN(uid) || uid < 0) {
    throw AppError.badRequest('INVALID_UID', 'uid 参数非法');
  }
  assertUidAuthorized(req, uid);
  return uid;
}

/** 从 body 参数解析 uid 并校验授权 */
function resolveUidFromBody(req: Request): number {
  const body = req.body as { uid?: number };
  const uid = body.uid;
  if (uid === undefined || typeof uid !== 'number' || uid < 0) {
    throw AppError.badRequest('INVALID_UID', 'uid 参数非法');
  }
  assertUidAuthorized(req, uid);
  return uid;
}

/** GET /api/files/list */
export async function handleList(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromQuery(req);
  const path = String(req.query['path'] as string ?? '');
  const result = await service.listDir(uid, path);
  res.json({ success: true, data: result });
}

/** GET /api/files/read */
export async function handleRead(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromQuery(req);
  const path = String(req.query['path'] as string ?? '');
  const result = await service.readFile(uid, path);
  res.json({ success: true, data: result });
}

/** POST /api/files/mkdir */
export async function handleMkdir(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromBody(req);
  const body = req.body as { path: string };
  const created = await service.mkdir(uid, body.path);
  res.status(201).json({ success: true, data: { created } });
}

/** POST /api/files/write */
export async function handleWrite(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromBody(req);
  const body = req.body as { path: string; content: string };
  const result = await service.writeFile(uid, body.path, body.content);
  res.json({ success: true, data: result });
}

/** POST /api/files/rename */
export async function handleRename(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromBody(req);
  const body = req.body as { path: string; newName: string };
  const result = await service.rename(uid, body.path, body.newName);
  res.json({ success: true, data: result });
}

/** DELETE /api/files/delete */
export async function handleDelete(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromBody(req);
  const body = req.body as { path: string; permanent?: boolean };
  const result = await service.deleteFile(uid, body.path, body.permanent ?? false);
  res.json({ success: true, data: result });
}

/** POST /api/files/copy */
export async function handleCopy(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromBody(req);
  const body = req.body as { src: string; dest: string };
  const result = await service.copyFile(uid, body.src, body.dest);
  res.json({ success: true, data: result });
}

/** GET /api/files/download */
export async function handleDownload(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromQuery(req);
  const path = String(req.query['path'] as string ?? '');
  const info = await service.getDownloadInfo(uid, path);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(info.filename)}"`);
  res.setHeader('Content-Length', info.size);
  const stream = createReadStream(info.absPath);
  stream.pipe(res);
}

/** POST /api/files/upload */
export async function handleUpload(req: Request, res: Response): Promise<void> {
  // multipart/form-data 中 uid 为 string，需转换
  const rawUid = (req.body as Record<string, string>)?.uid;
  const uid = parseInt(String(rawUid ?? ''), 10);
  if (Number.isNaN(uid) || uid < 0) {
    throw AppError.badRequest('INVALID_UID', 'uid 参数非法');
  }
  assertUidAuthorized(req, uid);
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
  const uid = resolveUidFromQuery(req);
  const result = await service.listTrash(uid);
  res.json({ success: true, data: result });
}

/** DELETE /api/files/trash/empty */
export async function handleEmptyTrash(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromQuery(req);
  await service.emptyTrash(uid);
  res.json({ success: true, data: { emptied: true } });
}

/** GET /api/files/preview */
export async function handlePreview(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromQuery(req);
  const path = String(req.query['path'] as string ?? '');
  const result = await service.getPreview(uid, path);
  res.json({ success: true, data: result });
}

/** GET /api/files/thumbnail */
export async function handleThumbnail(req: Request, res: Response): Promise<void> {
  const uid = resolveUidFromQuery(req);
  const path = String(req.query['path'] as string ?? '');
  const result = await service.getThumbnail(uid, path);
  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Content-Length', result.size);
  res.setHeader('X-Thumbnail-Cached', result.cached ? 'true' : 'false');
  res.sendFile(result.absPath);
}
