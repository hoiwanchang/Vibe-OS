/**
 * 模块：SNMP 监控 — 控制器
 */
import type { Request, Response } from 'express';
import * as service from './snmp.service.js';
import type { UpdateSnmpConfigRequest } from './snmp.types.js';

/** GET /api/snmp/status */
export async function handleGetStatus(_req: Request, res: Response): Promise<void> {
  const status = await service.getStatus();
  res.json({ success: true, data: status });
}

/** POST /api/snmp/start */
export async function handleStart(_req: Request, res: Response): Promise<void> {
  const result = await service.startService();
  res.json({ success: true, data: result });
}

/** POST /api/snmp/stop */
export async function handleStop(_req: Request, res: Response): Promise<void> {
  const result = await service.stopService();
  res.json({ success: true, data: result });
}

/** POST /api/snmp/restart */
export async function handleRestart(_req: Request, res: Response): Promise<void> {
  const result = await service.restartService();
  res.json({ success: true, data: result });
}

/** GET /api/snmp/config */
export async function handleGetConfig(_req: Request, res: Response): Promise<void> {
  const config = await service.getConfig();
  res.json({ success: true, data: config });
}

/** PUT /api/snmp/config */
export async function handleUpdateConfig(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateSnmpConfigRequest;
  const config = await service.updateConfig(
    body.community,
    body.listenAddress,
    body.enabledGroups,
  );
  res.json({ success: true, data: config });
}

/** GET /api/snmp/oids */
export async function handleGetOids(_req: Request, res: Response): Promise<void> {
  const data = await service.getOidData();
  res.json({ success: true, data });
}
