/**
 * 模块：WireGuard VPN — 控制器
 */
import type { Request, Response } from 'express';
import * as service from './vpn.service.js';
import type { InitServerRequest, AddPeerRequest, UpdateServerRequest } from './vpn.types.js';

/** GET /api/vpn/status */
export async function handleGetStatus(_req: Request, res: Response): Promise<void> {
  const status = await service.getStatus();
  res.json({ success: true, data: status });
}

/** POST /api/vpn/server */
export async function handleInitServer(req: Request, res: Response): Promise<void> {
  const body = req.body as InitServerRequest;
  const status = await service.initServer(body.port, body.subnet, body.dns);
  res.status(201).json({ success: true, data: status });
}

/** PUT /api/vpn/server */
export async function handleUpdateServer(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateServerRequest;
  const status = await service.updateServer(body.port, body.dns);
  res.json({ success: true, data: status });
}

/** GET /api/vpn/peers */
export async function handleListPeers(_req: Request, res: Response): Promise<void> {
  const peers = await service.listPeers();
  res.json({ success: true, data: { peers } });
}

/** POST /api/vpn/peers */
export async function handleAddPeer(req: Request, res: Response): Promise<void> {
  const body = req.body as AddPeerRequest;
  const result = await service.addPeer(body.name, body.allowedIps);
  res.status(201).json({ success: true, data: result });
}

/** DELETE /api/vpn/peers/:pubkey */
export async function handleRemovePeer(req: Request, res: Response): Promise<void> {
  const pubkey = String(req.params['pubkey'] ?? '');
  await service.removePeer(pubkey);
  res.json({ success: true, data: { removed: true } });
}

/** GET /api/vpn/peers/:pubkey/config */
export async function handleExportConfig(req: Request, res: Response): Promise<void> {
  const pubkey = String(req.params['pubkey'] ?? '');
  const config = await service.exportPeerConfig(pubkey);
  res.type('text/plain').send(config);
}
