/**
 * 模块：iSCSI Target 管理 — 请求处理
 */
import type { Request, Response } from 'express';
import * as service from './iscsi.service.js';
import type { AddLunRequest, CreateIscsiTargetRequest } from './iscsi.types.js';

/** GET /api/iscsi/targets — 列出所有 Target */
export async function handleListTargets(
  _req: Request,
  res: Response,
): Promise<void> {
  const targets = await service.listTargets();
  res.json({ success: true, data: targets });
}

/** POST /api/iscsi/targets — 创建 Target */
export async function handleCreateTarget(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as CreateIscsiTargetRequest;
  const result = await service.createTarget(body);
  res.status(201).json({ success: true, data: result });
}

/** DELETE /api/iscsi/targets/:iqn — 删除 Target */
export async function handleDeleteTarget(
  req: Request,
  res: Response,
): Promise<void> {
  const iqn = req.params['iqn'] as string;
  const result = await service.deleteTarget(iqn);
  res.json({ success: true, data: result });
}

/** GET /api/iscsi/targets/:iqn — Target 详情 */
export async function handleGetTarget(
  req: Request,
  res: Response,
): Promise<void> {
  const iqn = req.params['iqn'] as string;
  const detail = await service.getTargetDetail(iqn);
  res.json({ success: true, data: detail });
}

/** POST /api/iscsi/targets/:iqn/lun — 添加 LUN */
export async function handleAddLun(
  req: Request,
  res: Response,
): Promise<void> {
  const iqn = req.params['iqn'] as string;
  const body = req.body as AddLunRequest;
  const result = await service.addLun(iqn, body);
  res.status(201).json({ success: true, data: result });
}

/** DELETE /api/iscsi/targets/:iqn/lun/:lunId — 移除 LUN */
export async function handleRemoveLun(
  req: Request,
  res: Response,
): Promise<void> {
  const iqn = req.params['iqn'] as string;
  const lunId = Number(req.params['lunId']);
  const result = await service.removeLun(iqn, lunId);
  res.json({ success: true, data: result });
}
