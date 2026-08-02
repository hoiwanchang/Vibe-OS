/**
 * 模块：RAID 阵列管理 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './raid.service.js';
import type { CreateRaidRequest } from './raid.types.js';

/** GET /api/storage/raid — 列出所有 RAID 阵列 */
export async function handleListArrays(_req: Request, res: Response): Promise<void> {
  const arrays = await service.listArrays();
  res.json({ success: true, data: { arrays } });
}

/** POST /api/storage/raid — 创建阵列 */
export async function handleCreateArray(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateRaidRequest;
  const detail = await service.createArray(body.name, body.level, body.devices, body.spares ?? []);
  res.status(201).json({ success: true, data: { array: detail } });
}

/** GET /api/storage/raid/:name — 阵列详情 */
export async function handleGetArray(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const detail = await service.getArrayDetail(name);
  res.json({ success: true, data: { array: detail } });
}

/** POST /api/storage/raid/:name/add — 添加磁盘 */
export async function handleAddDevice(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const body = req.body as { device: string };
  const detail = await service.addDevice(name, body.device);
  res.json({ success: true, data: { array: detail } });
}

/** POST /api/storage/raid/:name/remove — 移除磁盘 */
export async function handleRemoveDevice(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const body = req.body as { device: string };
  const detail = await service.removeDevice(name, body.device);
  res.json({ success: true, data: { array: detail } });
}

/** POST /api/storage/raid/:name/rebuild — 触发重建 */
export async function handleRebuild(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const result = await service.rebuildArray(name);
  res.json({ success: true, data: result });
}

/** DELETE /api/storage/raid/:name — 删除阵列 */
export async function handleDeleteArray(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const result = await service.deleteArray(name);
  res.json({ success: true, data: result });
}
