/**
 * oauth-clients 模块 — 请求处理层
 */
import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/async-handler.js';
import * as service from './oauth-clients.service.js';
import type { CreateClientRequest, UpdateClientRequest } from './oauth-clients.types.js';

/** GET /api/oauth/clients */
export const listHandler = asyncHandler(async (_req: Request, res: Response) => {
  const clients = await service.listClients();
  res.json({ success: true, data: clients });
});

/** POST /api/oauth/clients */
export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.createClient(req.body as CreateClientRequest);
  res.status(201).json({ success: true, data: result });
});

/** GET /api/oauth/clients/:id */
export const getHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const client = await service.getClient(id);
  res.json({ success: true, data: client });
});

/** PUT /api/oauth/clients/:id */
export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const client = await service.updateClient(id, req.body as UpdateClientRequest);
  res.json({ success: true, data: client });
});

/** DELETE /api/oauth/clients/:id */
export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  await service.deleteClient(id);
  res.json({ success: true, data: { message: '已删除' } });
});

/** POST /api/oauth/clients/:id/reset-secret */
export const resetSecretHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const result = await service.resetSecret(id);
  res.json({ success: true, data: result });
});
