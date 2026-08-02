/**
 * 模块：反向代理管理 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './proxy.controller.js';

const router: IRouter = Router();

/* ---------- 规则 CRUD ---------- */

/** GET /api/proxy/rules */
router.get('/proxy/rules', asyncHandler(controller.handleListRules));

/** GET /api/proxy/rules/:id */
const idParamSchema = z.object({ id: z.string().uuid() });
router.get(
  '/proxy/rules/:id',
  validateParams(idParamSchema),
  asyncHandler(controller.handleGetRule),
);

/** POST /api/proxy/rules */
const createRuleSchema = z.object({
  name: z.string().min(1).max(128),
  domain: z.string().min(1).max(253),
  path: z.string().startsWith('/').max(512).optional(),
  target: z.string().min(1).max(253),
  websocket: z.boolean().optional(),
  https: z.boolean().optional(),
  accessLog: z.boolean().optional(),
  enabled: z.boolean().optional(),
});
router.post(
  '/proxy/rules',
  validateBody(createRuleSchema),
  asyncHandler(controller.handleCreateRule),
);

/** PUT /api/proxy/rules/:id */
const updateRuleSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  domain: z.string().min(1).max(253).optional(),
  path: z.string().startsWith('/').max(512).optional(),
  target: z.string().min(1).max(253).optional(),
  websocket: z.boolean().optional(),
  https: z.boolean().optional(),
  accessLog: z.boolean().optional(),
  enabled: z.boolean().optional(),
});
router.put(
  '/proxy/rules/:id',
  validateParams(idParamSchema),
  validateBody(updateRuleSchema),
  asyncHandler(controller.handleUpdateRule),
);

/** DELETE /api/proxy/rules/:id */
router.delete(
  '/proxy/rules/:id',
  validateParams(idParamSchema),
  asyncHandler(controller.handleDeleteRule),
);

/* ---------- nginx 重载 ---------- */

/** POST /api/proxy/reload */
router.post('/proxy/reload', asyncHandler(controller.handleReload));

/* ---------- 证书管理 ---------- */

/** GET /api/proxy/certs */
router.get('/proxy/certs', asyncHandler(controller.handleGetCerts));

/** POST /api/proxy/certs */
const generateCertSchema = z.object({
  commonName: z.string().max(253).optional(),
  sans: z.array(z.string().min(1).max(253)).min(1),
  days: z.number().int().min(1).max(3650).optional(),
  keySize: z.union([z.literal(2048), z.literal(4096)]).optional(),
});
router.post(
  '/proxy/certs',
  validateBody(generateCertSchema),
  asyncHandler(controller.handleGenerateCert),
);

/* ---------- 状态 ---------- */

/** GET /api/proxy/status */
router.get('/proxy/status', asyncHandler(controller.handleStatus));

export default router;
