/**
 * 模块：回收站策略 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './recyclebin.service.js';
import type { UpdateRecycleBinConfigRequest } from './recyclebin.types.js';

/** GET /api/recyclebin/config — 获取回收站配置 */
export async function handleGetConfig(
  _req: Request,
  res: Response,
): Promise<void> {
  const config = await service.getConfig();
  res.json({ success: true, data: config });
}

/** PUT /api/recyclebin/config — 更新回收站配置 */
export async function handleUpdateConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as UpdateRecycleBinConfigRequest;
  const config = await service.updateConfig(body);
  res.json({ success: true, data: config });
}

/** GET /api/recyclebin/files — 列出回收站文件 */
export async function handleListFiles(
  req: Request,
  res: Response,
): Promise<void> {
  const shareName =
    typeof req.query['share'] === 'string'
      ? req.query['share']
      : undefined;
  const files = await service.listFiles(shareName);
  res.json({ success: true, data: { files } });
}

/** POST /api/recyclebin/restore/:id — 恢复文件 */
export async function handleRestoreFile(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params['id'];
  if (typeof id !== 'string' || !id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '缺少文件 ID' } });
    return;
  }
  const result = await service.restoreFile(id);
  res.json({ success: true, data: result });
}

/** DELETE /api/recyclebin/empty — 清空回收站 */
export async function handleEmpty(
  req: Request,
  res: Response,
): Promise<void> {
  const shareName =
    typeof req.query['share'] === 'string'
      ? req.query['share']
      : undefined;
  const result = await service.emptyRecycleBin(shareName);
  res.json({ success: true, data: result });
}

/** GET /api/recyclebin/stats — 回收站统计 */
export async function handleGetStats(
  _req: Request,
  res: Response,
): Promise<void> {
  const stats = await service.getStats();
  res.json({ success: true, data: stats });
}
