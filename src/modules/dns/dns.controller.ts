/**
 * 模块：DNS 服务器 — 请求处理
 */
import type { Request, Response } from 'express';
import * as service from './dns.service.js';
import type { CreateDnsRecordRequest, UpdateDnsConfigRequest } from './dns.types.js';

/** GET /api/dns/status — dnsmasq 服务状态 */
export async function handleGetStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const status = await service.getStatus();
  res.json({ success: true, data: status });
}

/** GET /api/dns/records — 自定义 DNS 记录列表 */
export async function handleListRecords(
  _req: Request,
  res: Response,
): Promise<void> {
  const records = await service.listRecords();
  res.json({ success: true, data: records });
}

/** POST /api/dns/records — 添加 DNS 记录 */
export async function handleAddRecord(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as CreateDnsRecordRequest;
  const result = await service.addRecord(body);
  res.status(201).json({ success: true, data: result });
}

/** DELETE /api/dns/records/:id — 删除 DNS 记录 */
export async function handleDeleteRecord(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params['id'] as string;
  const result = await service.deleteRecord(id);
  res.json({ success: true, data: result });
}

/** PUT /api/dns/config — 更新上游 DNS 配置 */
export async function handleUpdateConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as UpdateDnsConfigRequest;
  const config = await service.updateConfig(body);
  res.json({ success: true, data: config });
}

/** GET /api/dns/config — 获取当前配置 */
export async function handleGetConfig(
  _req: Request,
  res: Response,
): Promise<void> {
  const config = await service.getConfig();
  res.json({ success: true, data: config });
}
