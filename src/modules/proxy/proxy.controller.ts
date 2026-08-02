/**
 * 模块：反向代理管理 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './proxy.service.js';
import type {
  CreateProxyRuleInput,
  UpdateProxyRuleInput,
  GenerateCertInput,
} from './proxy.types.js';

/** GET /api/proxy/rules — 获取全部规则 */
export async function handleListRules(
  _req: Request,
  res: Response,
): Promise<void> {
  const data = await service.listRules();
  res.json({ success: true, data });
}

/** GET /api/proxy/rules/:id — 获取单条规则 */
export async function handleGetRule(
  req: Request,
  res: Response,
): Promise<void> {
  const data = await service.getRule(String(req.params['id'] ?? ''));
  res.json({ success: true, data });
}

/** POST /api/proxy/rules — 创建规则 */
export async function handleCreateRule(
  req: Request,
  res: Response,
): Promise<void> {
  const input = req.body as CreateProxyRuleInput;
  const data = await service.createRule(input);
  res.status(201).json({ success: true, data });
}

/** PUT /api/proxy/rules/:id — 更新规则 */
export async function handleUpdateRule(
  req: Request,
  res: Response,
): Promise<void> {
  const input = req.body as UpdateProxyRuleInput;
  const data = await service.updateRule(String(req.params['id'] ?? ''), input);
  res.json({ success: true, data });
}

/** DELETE /api/proxy/rules/:id — 删除规则 */
export async function handleDeleteRule(
  req: Request,
  res: Response,
): Promise<void> {
  const data = await service.deleteRule(String(req.params['id'] ?? ''));
  res.json({ success: true, data });
}

/** POST /api/proxy/reload — 重载 nginx */
export async function handleReload(
  _req: Request,
  res: Response,
): Promise<void> {
  const data = await service.reloadNginx();
  res.json({ success: true, data });
}

/** GET /api/proxy/certs — 获取证书状态 */
export async function handleGetCerts(
  _req: Request,
  res: Response,
): Promise<void> {
  const data = await service.getCertInfo();
  res.json({ success: true, data });
}

/** POST /api/proxy/certs — 生成自签证书 */
export async function handleGenerateCert(
  req: Request,
  res: Response,
): Promise<void> {
  const input = req.body as GenerateCertInput;
  const data = await service.generateCert(input);
  res.status(201).json({ success: true, data });
}

/** GET /api/proxy/status — 获取代理模块状态 */
export async function handleStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const data = await service.getStatus();
  res.json({ success: true, data });
}
