/**
 * 模块：文件版本控制 — 控制器层
 */
import type { Request, Response } from 'express';
import { createReadStream } from 'node:fs';
import { AppError } from '../../common/app-error.js';
import * as service from './fileversion.service.js';
import type { VersionPolicyMode } from './fileversion.types.js';

/** 从 query 解析并校验 uid（必须为非负整数） */
function parseUid(req: Request): number {
  const uid = parseInt(String(req.query['uid'] as string ?? ''), 10);
  if (!Number.isInteger(uid) || uid < 0) {
    throw AppError.badRequest('VALIDATION_ERROR', 'uid 必须为非负整数');
  }
  return uid;
}

/** 从 query 解析并校验 version（必须为正整数） */
function parseVersion(req: Request): number {
  const version = parseInt(String(req.query['version'] as string ?? ''), 10);
  if (!Number.isInteger(version) || version < 1) {
    throw AppError.badRequest('VALIDATION_ERROR', 'version 必须为正整数');
  }
  return version;
}

/** 从 query 解析并校验 path（必须非空） */
function parsePath(req: Request): string {
  const filePath = String(req.query['path'] as string ?? '');
  if (filePath.length === 0) {
    throw AppError.badRequest('VALIDATION_ERROR', 'path 不能为空');
  }
  return filePath;
}

/** GET /api/files/versions */
export async function handleList(req: Request, res: Response): Promise<void> {
  const uid = parseUid(req);
  const filePath = parsePath(req);
  const result = await service.listVersions(uid, filePath);
  res.json({ success: true, data: result });
}

/** GET /api/files/versions/download */
export async function handleDownload(req: Request, res: Response): Promise<void> {
  const uid = parseUid(req);
  const filePath = parsePath(req);
  const version = parseVersion(req);
  const info = await service.getVersionFile(uid, filePath, version);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(info.filename)}"`,
  );
  createReadStream(info.absPath).pipe(res);
}

/** POST /api/files/versions/restore */
export async function handleRestore(req: Request, res: Response): Promise<void> {
  const body = req.body as { uid: number; path: string; version: number };
  const result = await service.restoreVersion(body.uid, body.path, body.version);
  res.json({ success: true, data: result });
}

/** DELETE /api/files/versions */
export async function handleDelete(req: Request, res: Response): Promise<void> {
  const uid = parseUid(req);
  const filePath = parsePath(req);
  const version = parseVersion(req);
  const result = await service.deleteVersion(uid, filePath, version);
  res.json({ success: true, data: result });
}

/** GET /api/files/versions/policy */
export async function handleGetPolicy(req: Request, res: Response): Promise<void> {
  const share = String(req.query['share'] as string ?? 'default');
  const policy = await service.getPolicy(share);
  res.json({ success: true, data: policy });
}

/** PUT /api/files/versions/policy */
export async function handleSetPolicy(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    share: string;
    mode?: VersionPolicyMode;
    maxVersions?: number;
    maxDays?: number;
  };
  const policy = await service.setPolicy(body.share, {
    mode: body.mode,
    maxVersions: body.maxVersions,
    maxDays: body.maxDays,
  });
  res.json({ success: true, data: policy });
}
