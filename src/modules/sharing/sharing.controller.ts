/**
 * 模块：共享文件夹 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './sharing.service.js';

export async function handleList(_req: Request, res: Response): Promise<void> {
  const shares = await service.listShares();
  res.json({ success: true, data: { shares } });
}

export async function handleCreate(req: Request, res: Response): Promise<void> {
  const body = req.body as { name: string; path: string; protocol: 'smb' | 'nfs' | 'webdav'; readonly: boolean; validUsers?: string[]; hosts?: string[]; port?: number };
  const share = await service.createShare({ name: body.name, path: body.path, protocol: body.protocol, readonly: body.readonly, validUsers: body.validUsers ?? [], hosts: body.hosts ?? [], port: body.port });
  res.status(201).json({ success: true, data: { share } });
}

export async function handleUpdate(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const share = await service.updateShare(name, req.body as Record<string, unknown>);
  res.json({ success: true, data: { share } });
}

export async function handleRemove(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const removed = await service.removeShare(name);
  res.json({ success: true, data: { removed } });
}

export async function handleStatus(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const connections = await service.getShareStatus(name);
  res.json({ success: true, data: { activeConnections: connections } });
}

export async function handleRestart(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const result = await service.restartShare(name);
  res.json({ success: true, data: result });
}
