/**
 * 模块：网络配置 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './network.service.js';

export async function handleListInterfaces(_req: Request, res: Response): Promise<void> {
  const interfaces = await service.listInterfaces();
  res.json({ success: true, data: { interfaces } });
}

export async function handleConfigureInterface(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const body = req.body as { method: 'dhcp' | 'static'; ip?: string; netmask?: string; gateway?: string; dns?: string[] };
  const iface = await service.configureInterface(name, body);
  res.json({ success: true, data: { interface: iface } });
}

export async function handleGetDns(_req: Request, res: Response): Promise<void> {
  const dns = await service.getDns();
  res.json({ success: true, data: dns });
}

export async function handleSetDns(req: Request, res: Response): Promise<void> {
  const body = req.body as { servers: string[]; search?: string[] };
  const updated = await service.setDns(body.servers, body.search);
  res.json({ success: true, data: { updated } });
}

export async function handleListFirewall(_req: Request, res: Response): Promise<void> {
  const result = await service.listFirewallRules();
  res.json({ success: true, data: result });
}

export async function handleAddFirewall(req: Request, res: Response): Promise<void> {
  const body = req.body as { chain: string; protocol: string; port: number | string | null; action: string; source?: string; comment?: string };
  const rule = await service.addFirewallRule(body);
  res.status(201).json({ success: true, data: { rule } });
}

export async function handleRemoveFirewall(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const removed = await service.removeFirewallRule(id);
  res.json({ success: true, data: { removed } });
}

export async function handleListPorts(_req: Request, res: Response): Promise<void> {
  const ports = await service.listPorts();
  res.json({ success: true, data: { ports } });
}

export async function handleListWol(_req: Request, res: Response): Promise<void> {
  const devices = await service.listWolDevices();
  res.json({ success: true, data: { devices } });
}

export async function handleSendWol(req: Request, res: Response): Promise<void> {
  const body = req.body as { mac: string; broadcast?: string };
  const sent = await service.sendWol(body.mac, body.broadcast);
  res.json({ success: true, data: { sent } });
}
