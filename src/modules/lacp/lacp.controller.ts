/**
 * 模块：链路聚合（LACP/Bonding） — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './lacp.service.js';
import type { CreateBondRequest } from './lacp.types.js';

/** GET /api/lacp — Bonding 接口列表 */
export async function handleListBonds(_req: Request, res: Response): Promise<void> {
  const bonds = await service.listBonds();
  res.json({ success: true, data: { bonds } });
}

/** POST /api/lacp — 创建 Bonding */
export async function handleCreateBond(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateBondRequest;
  const bond = await service.createBond(body);
  res.status(201).json({ success: true, data: { bond } });
}

/** DELETE /api/lacp/:name — 删除 Bonding */
export async function handleDeleteBond(req: Request, res: Response): Promise<void> {
  const name = req.params['name'] as string;
  const result = await service.deleteBond(name);
  res.json({ success: true, data: result });
}

/** POST /api/lacp/:name/members — 添加成员网卡 */
export async function handleAddMember(req: Request, res: Response): Promise<void> {
  const name = req.params['name'] as string;
  const body = req.body as { member: string };
  const result = await service.addMember(name, body.member);
  res.status(201).json({ success: true, data: result });
}

/** DELETE /api/lacp/:name/members/:member — 移除成员网卡 */
export async function handleRemoveMember(req: Request, res: Response): Promise<void> {
  const name = req.params['name'] as string;
  const member = req.params['member'] as string;
  const result = await service.removeMember(name, member);
  res.json({ success: true, data: result });
}

/** GET /api/lacp/:name/status — Bonding 聚合状态 */
export async function handleGetBondStatus(req: Request, res: Response): Promise<void> {
  const name = req.params['name'] as string;
  const status = await service.getBondStatus(name);
  res.json({ success: true, data: status });
}
