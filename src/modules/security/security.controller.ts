/**
 * 模块：安全（IP 封禁） — 请求处理
 */
import type { Request, Response } from 'express';
import * as service from './security.service.js';

/** GET /api/security/banned — 封禁列表 */
export async function handleGetBanned(
  _req: Request,
  res: Response,
): Promise<void> {
  const list = await service.getBannedList();
  res.json({ success: true, data: { banned: list } });
}

/** POST /api/security/ban — 手动封禁 */
export async function handleBan(
  req: Request,
  res: Response,
): Promise<void> {
  const { ip, reason } = req.body as { ip: string; reason?: string };
  const entry = await service.banIp(ip, reason);
  res.status(201).json({ success: true, data: entry });
}

/** DELETE /api/security/ban/:ip — 解封 */
export async function handleUnban(
  req: Request,
  res: Response,
): Promise<void> {
  const ip = req.params['ip'] as string;
  await service.unbanIp(ip);
  res.json({ success: true, data: { ip, unbanned: true } });
}

/** GET /api/security/policy — 获取封禁策略 */
export async function handleGetPolicy(
  _req: Request,
  res: Response,
): Promise<void> {
  const policy = await service.getPolicy();
  res.json({ success: true, data: policy });
}

/** PUT /api/security/policy — 更新封禁策略 */
export async function handleUpdatePolicy(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as Parameters<typeof service.updatePolicy>[0];
  const policy = await service.updatePolicy(body);
  res.json({ success: true, data: policy });
}

/** POST /api/security/record-failure — 记录登录失败 */
export async function handleRecordFailure(
  req: Request,
  res: Response,
): Promise<void> {
  const { ip } = req.body as { ip: string };
  const result = await service.recordFailure(ip);
  res.json({ success: true, data: result });
}
