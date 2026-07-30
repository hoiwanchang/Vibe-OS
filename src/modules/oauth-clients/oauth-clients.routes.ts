/**
 * oauth-clients 模块 — 路由（需要 admin 权限）
 */
import { Router, type Router as RouterType } from 'express';
import { requireRole } from '../../common/rbac.js';
import {
  createHandler,
  deleteHandler,
  getHandler,
  listHandler,
  resetSecretHandler,
  updateHandler,
} from './oauth-clients.controller.js';

export const oauthClientRoutes: RouterType = Router();

oauthClientRoutes.get('/oauth/clients', requireRole('admin'), listHandler);
oauthClientRoutes.post('/oauth/clients', requireRole('admin'), createHandler);
oauthClientRoutes.get('/oauth/clients/:id', requireRole('admin'), getHandler);
oauthClientRoutes.put('/oauth/clients/:id', requireRole('admin'), updateHandler);
oauthClientRoutes.delete('/oauth/clients/:id', requireRole('admin'), deleteHandler);
oauthClientRoutes.post('/oauth/clients/:id/reset-secret', requireRole('admin'), resetSecretHandler);
