/**
 * 模块：LUKS 卷加密 — 控制器层
 */
import type { Request, Response } from 'express';
import { AppError } from '../../common/app-error.js';
import * as service from './luks.service.js';

/** POST /api/luks/create */
export async function handleCreate(req: Request, res: Response): Promise<void> {
  const { device, passphrase, keyfile } = req.body as {
    device: string;
    passphrase?: string;
    keyfile?: string;
  };
  const result = await service.createVolume(device, passphrase, keyfile);
  res.status(201).json({ success: true, data: result });
}

/** POST /api/luks/open */
export async function handleOpen(req: Request, res: Response): Promise<void> {
  const { device, name, passphrase, keyfile } = req.body as {
    device: string;
    name: string;
    passphrase?: string;
    keyfile?: string;
  };
  const result = await service.openVolume(device, name, passphrase, keyfile);
  res.json({ success: true, data: result });
}

/** POST /api/luks/close */
export async function handleClose(req: Request, res: Response): Promise<void> {
  const { name } = req.body as { name: string };
  const result = await service.closeVolume(name);
  res.json({ success: true, data: result });
}

/** GET /api/luks/status */
export async function handleStatus(_req: Request, res: Response): Promise<void> {
  const volumes = await service.listStatus();
  res.json({ success: true, data: { volumes } });
}

/** GET /api/luks/:name */
export async function handleVolumeDetail(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const volume = await service.getVolumeStatus(name);
  if (!volume) {
    throw AppError.notFound(`LUKS 卷 [${name}]`);
  }
  res.json({ success: true, data: { volume } });
}

/** POST /api/luks/keyfile */
export async function handleKeyfile(req: Request, res: Response): Promise<void> {
  const { name } = req.body as { name: string };
  const result = await service.generateKeyfile(name);
  res.status(201).json({ success: true, data: result });
}

/** PUT /api/luks/autounlock */
export async function handleAutounlock(req: Request, res: Response): Promise<void> {
  const { name, device, keyfile } = req.body as {
    name: string;
    device: string;
    keyfile?: string;
  };
  const result = await service.configureAutounlock(name, device, keyfile);
  res.json({ success: true, data: result });
}
