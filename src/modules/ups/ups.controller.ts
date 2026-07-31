/**
 * 模块：UPS 电源管理（NUT） — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './ups.service.js';
import type { UpdateUpsConfigRequest } from './ups.types.js';

/** GET /api/ups/status — UPS 实时状态 */
export async function handleGetStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const status = await service.getStatus();
  res.json({ success: true, data: status });
}

/** GET /api/ups/config — 当前配置 */
export async function handleGetConfig(
  _req: Request,
  res: Response,
): Promise<void> {
  const config = await service.getConfig();
  res.json({ success: true, data: config });
}

/** PUT /api/ups/config — 更新配置 */
export async function handleUpdateConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as UpdateUpsConfigRequest;
  const config = await service.updateConfig(body);
  res.json({ success: true, data: config });
}

/** POST /api/ups/test-shutdown — 模拟关机测试 */
export async function handleTestShutdown(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await service.testShutdown();
  res.json({ success: true, data: result });
}

/** GET /api/ups/history — 事件历史 */
export async function handleGetHistory(
  _req: Request,
  res: Response,
): Promise<void> {
  const history = await service.getHistory();
  res.json({ success: true, data: { events: history } });
}
