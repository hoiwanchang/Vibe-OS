/**
 * 模块：安装向导 — 控制器
 */
import type { Request, Response } from 'express';
import * as service from './setup.service.js';
import type { SetupCompleteRequest } from './setup.types.js';

/** GET /api/setup/status */
export async function handleGetStatus(_req: Request, res: Response): Promise<void> {
  const initialized = await service.isInitialized();
  res.json({ success: true, data: { initialized } });
}

/** GET /api/setup/disks */
export async function handleListDisks(_req: Request, res: Response): Promise<void> {
  const disks = await service.listDisks();
  res.json({ success: true, data: { disks } });
}

/** POST /api/setup/complete */
export async function handleComplete(req: Request, res: Response): Promise<void> {
  const body = req.body as SetupCompleteRequest;
  await service.complete(body);
  res.status(201).json({ success: true, data: { message: '初始化完成' } });
}
