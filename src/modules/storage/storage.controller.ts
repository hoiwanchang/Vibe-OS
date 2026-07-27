/**
 * 模块：存储池管理 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './storage.service.js';

/** GET /api/storage/disks */
export async function handleListDisks(_req: Request, res: Response): Promise<void> {
  const disks = await service.listDisks();
  res.json({ success: true, data: { disks } });
}

/** GET /api/storage/pools */
export async function handleListPools(_req: Request, res: Response): Promise<void> {
  const pools = await service.listPools();
  res.json({ success: true, data: { pools } });
}

/** POST /api/storage/pools */
export async function handleCreatePool(req: Request, res: Response): Promise<void> {
  const body = req.body as { name: string; level: string; disks: string[] };
  const pool = await service.createPool(body.name, body.level, body.disks);
  res.status(201).json({ success: true, data: { pool } });
}

/** DELETE /api/storage/pools/:name */
export async function handleDestroyPool(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const destroyed = await service.destroyPool(name);
  res.json({ success: true, data: { destroyed } });
}

/** POST /api/storage/pools/:name/expand */
export async function handleExpandPool(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const body = req.body as { disks: string[] };
  const pool = await service.expandPool(name, body.disks);
  res.json({ success: true, data: { pool } });
}

/** GET /api/storage/pools/:name/smart */
export async function handlePoolSmart(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const disks = await service.getPoolSmart(name);
  res.json({ success: true, data: { disks } });
}

/** POST /api/storage/pools/:name/scrub */
export async function handleStartScrub(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const result = await service.startScrub(name);
  res.json({ success: true, data: result });
}

/** GET /api/storage/pools/:name/scrub/status */
export async function handleScrubStatus(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const status = await service.getScrubStatus(name);
  res.json({ success: true, data: status });
}
