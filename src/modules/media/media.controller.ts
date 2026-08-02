/**
 * 模块：DLNA/UPnP 媒体服务器 — 请求处理
 */
import type { Request, Response } from 'express';
import * as service from './media.service.js';
import type { MediaConfigRequest } from './media.types.js';

/** GET /api/media/status — DLNA 服务状态 */
export async function handleGetStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const status = await service.getStatus();
  res.json({ success: true, data: status });
}

/** PUT /api/media/config — 更新媒体库配置 */
export async function handleUpdateConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as MediaConfigRequest;
  const result = await service.updateConfig(body);
  res.json({ success: true, data: result });
}

/** POST /api/media/rescan — 触发重新扫描 */
export async function handleRescan(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await service.rescan();
  res.json({ success: true, data: result });
}

/** GET /api/media/clients — 已连接客户端列表 */
export async function handleGetClients(
  _req: Request,
  res: Response,
): Promise<void> {
  const clients = await service.getClients();
  res.json({ success: true, data: clients });
}
