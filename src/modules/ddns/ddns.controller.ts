/**
 * 模块：动态 DNS — 请求处理
 */
import type { Request, Response } from 'express';
import * as service from './ddns.service.js';

/** GET /api/ddns/status — DDNS 状态 */
export async function handleGetStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const status = await service.getStatus();
  res.json({ success: true, data: status });
}

/** PUT /api/ddns/config — 更新配置 */
export async function handleUpdateConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as Parameters<typeof service.updateConfig>[0];
  const config = await service.updateConfig(body);
  res.json({ success: true, data: config });
}

/** POST /api/ddns/update — 手动触发更新 */
export async function handleUpdate(
  _req: Request,
  res: Response,
): Promise<void> {
  const results = await service.runUpdate();
  res.json({ success: true, data: { results } });
}

/** GET /api/ddns/history — 更新历史 */
export async function handleGetHistory(
  req: Request,
  res: Response,
): Promise<void> {
  const limit = parseInt((req.query['limit'] as string) ?? '50', 10);
  const history = await service.getHistory(limit);
  res.json({ success: true, data: { history } });
}
