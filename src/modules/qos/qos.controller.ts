/**
 * 模块：QoS 带宽控制 — 请求处理
 */
import type { Request, Response } from 'express';
import * as service from './qos.service.js';
import type { CreateQosRuleRequest } from './qos.types.js';

/** GET /api/qos/rules — QoS 规则列表 */
export async function handleListRules(
  _req: Request,
  res: Response,
): Promise<void> {
  const rules = await service.listRules();
  res.json({ success: true, data: rules });
}

/** POST /api/qos/rules — 创建 QoS 规则 */
export async function handleCreateRule(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as CreateQosRuleRequest;
  const result = await service.createRule(body);
  res.status(201).json({ success: true, data: result });
}

/** DELETE /api/qos/rules/:id — 删除 QoS 规则 */
export async function handleDeleteRule(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params['id'] as string;
  const result = await service.deleteRule(id);
  res.json({ success: true, data: result });
}

/** GET /api/qos/status — 接口流量统计 */
export async function handleGetStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const status = await service.getStatus();
  res.json({ success: true, data: status });
}
