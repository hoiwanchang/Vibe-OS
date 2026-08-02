/**
 * 模块：应用自动更新 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './appupdate.service.js';

/** GET /api/appupdate/status */
export async function handleGetStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const status = await service.getStatus();
  res.json({ success: true, data: status });
}

/** PUT /api/appupdate/config */
export async function handleUpdateConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as {
    mode: 'manual' | 'auto';
    maintenanceWindow?: string;
  };
  const config = await service.updateConfig(body);
  res.json({ success: true, data: { config } });
}

/** POST /api/appupdate/check */
export async function handleCheck(
  _req: Request,
  res: Response,
): Promise<void> {
  const updates = await service.checkUpdates();
  res.json({ success: true, data: { updates } });
}

/** GET /api/appupdate/available */
export async function handleGetAvailable(
  _req: Request,
  res: Response,
): Promise<void> {
  const updates = await service.getAvailable();
  res.json({ success: true, data: { updates } });
}

/** POST /api/appupdate/apply/:appId */
export async function handleApply(
  req: Request,
  res: Response,
): Promise<void> {
  const appId = String(req.params['appId'] ?? '');
  const entry = await service.applyUpdate(appId);
  res.json({ success: true, data: { entry } });
}

/** GET /api/appupdate/history */
export async function handleGetHistory(
  _req: Request,
  res: Response,
): Promise<void> {
  const history = await service.getHistory();
  res.json({ success: true, data: { history } });
}
