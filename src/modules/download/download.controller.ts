/**
 * 模块：下载中心 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './download.service.js';

export async function handleListTasks(_req: Request, res: Response): Promise<void> {
  const tasks = await service.listTasks();
  res.json({ success: true, data: { tasks } });
}

export async function handleAddTask(req: Request, res: Response): Promise<void> {
  const body = req.body as { urls: string[]; targetDir?: string; headers?: Record<string, string> };
  const gids = await service.addTask(body.urls, body.targetDir, body.headers);
  res.status(201).json({ success: true, data: { gids } });
}

export async function handleRemoveTask(req: Request, res: Response): Promise<void> {
  const gid = String(req.params['gid'] ?? '');
  const removed = await service.removeTask(gid);
  res.json({ success: true, data: { removed } });
}

export async function handlePauseTask(req: Request, res: Response): Promise<void> {
  const gid = String(req.params['gid'] ?? '');
  const paused = await service.pauseTask(gid);
  res.json({ success: true, data: { paused } });
}

export async function handleResumeTask(req: Request, res: Response): Promise<void> {
  const gid = String(req.params['gid'] ?? '');
  const resumed = await service.resumeTask(gid);
  res.json({ success: true, data: { resumed } });
}

export async function handleGetTask(req: Request, res: Response): Promise<void> {
  const gid = String(req.params['gid'] ?? '');
  const task = await service.getTask(gid);
  res.json({ success: true, data: { task } });
}

export async function handleGetSettings(_req: Request, res: Response): Promise<void> {
  const settings = await service.getSettings();
  res.json({ success: true, data: { settings } });
}

export async function handleUpdateSettings(req: Request, res: Response): Promise<void> {
  const updated = await service.updateSettings(req.body as Record<string, string>);
  res.json({ success: true, data: { updated } });
}
