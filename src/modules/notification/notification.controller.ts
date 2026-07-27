/**
 * 模块：通知与告警 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './notification.service.js';

export async function handleList(req: Request, res: Response): Promise<void> {
  const limit = parseInt(String(req.query['limit'] as string ?? '50'), 10);
  const offset = parseInt(String(req.query['offset'] as string ?? '0'), 10);
  const rawSeverity = req.query['severity'];
  const severity = typeof rawSeverity === 'string' ? rawSeverity : undefined;
  const result = await service.list(limit, offset, severity);
  res.json({ success: true, data: result });
}

export async function handleMarkRead(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const updated = await service.markRead(id);
  res.json({ success: true, data: { updated } });
}

export async function handleMarkAllRead(_req: Request, res: Response): Promise<void> {
  const updated = await service.markAllRead();
  res.json({ success: true, data: { updated } });
}

export async function handleRemove(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const removed = await service.remove(id);
  res.json({ success: true, data: { removed } });
}

export async function handleGetSettings(_req: Request, res: Response): Promise<void> {
  const channels = await service.getSettings();
  res.json({ success: true, data: { channels } });
}

export async function handleUpdateSettings(req: Request, res: Response): Promise<void> {
  const body = req.body as { channels: Array<{ type: string; enabled: boolean; url?: string; minSeverity: string }> };
  const updated = await service.updateSettings(body.channels as never);
  res.json({ success: true, data: { updated } });
}

export async function handleUnreadCount(_req: Request, res: Response): Promise<void> {
  const count = await service.unreadCount();
  res.json({ success: true, data: { count } });
}
