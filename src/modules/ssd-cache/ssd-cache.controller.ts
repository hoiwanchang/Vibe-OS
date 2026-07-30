/**
 * 模块：SSD 缓存管理 — 请求处理
 */
import type { Request, Response } from 'express';
import * as service from './ssd-cache.service.js';
import type { CreateSsdCacheRequest } from './ssd-cache.types.js';

/** POST /api/ssd-cache/create — 创建 SSD 缓存 */
export async function handleCreate(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as CreateSsdCacheRequest;
  const result = await service.createCache(body);
  res.status(201).json({ success: true, data: result });
}

/** DELETE /api/ssd-cache/:name — 移除 SSD 缓存 */
export async function handleRemove(
  req: Request,
  res: Response,
): Promise<void> {
  const name = req.params['name'] as string;
  const result = await service.removeCache(name);
  res.json({ success: true, data: result });
}

/** GET /api/ssd-cache/status — 缓存状态列表 */
export async function handleGetStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const list = await service.getStatusList();
  res.json({ success: true, data: list });
}

/** GET /api/ssd-cache/:name — 单个缓存详情 */
export async function handleGetDetail(
  req: Request,
  res: Response,
): Promise<void> {
  const name = req.params['name'] as string;
  const detail = await service.getCacheDetail(name);
  res.json({ success: true, data: detail });
}
