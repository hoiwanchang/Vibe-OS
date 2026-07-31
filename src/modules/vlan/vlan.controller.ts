/**
 * 模块：VLAN 管理 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './vlan.service.js';
import type { CreateVlanRequest, UpdateVlanRequest } from './vlan.types.js';

/** GET /api/vlan — VLAN 列表 */
export async function handleListVlans(_req: Request, res: Response): Promise<void> {
  const vlans = await service.listVlans();
  res.json({ success: true, data: { vlans } });
}

/** POST /api/vlan — 创建 VLAN */
export async function handleCreateVlan(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateVlanRequest;
  const vlan = await service.createVlan(body);
  res.status(201).json({ success: true, data: { vlan } });
}

/** DELETE /api/vlan/:id — 删除 VLAN */
export async function handleDeleteVlan(req: Request, res: Response): Promise<void> {
  const id = req.params['id'] as string;
  const result = await service.deleteVlan(id);
  res.json({ success: true, data: result });
}

/** PUT /api/vlan/:id — 更新 VLAN（改 IP） */
export async function handleUpdateVlan(req: Request, res: Response): Promise<void> {
  const id = req.params['id'] as string;
  const body = req.body as UpdateVlanRequest;
  const vlan = await service.updateVlan(id, body);
  res.json({ success: true, data: { vlan } });
}
