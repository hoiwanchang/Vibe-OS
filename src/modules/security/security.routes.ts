/**
 * 模块：安全（IP 封禁） — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './security.controller.js';

const router: IRouter = Router();

/** IPv4/IPv6 地址校验 */
const ipSchema = z.string().regex(
  /^(\d{1,3}\.){3}\d{1,3}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$|^:(:[0-9a-fA-F]{1,4}){1,7}$/,
  '无效的 IP 地址',
);

/** GET /api/security/banned — 封禁列表 */
router.get('/security/banned', asyncHandler(controller.handleGetBanned));

/** POST /api/security/ban — 手动封禁 */
const banSchema = z.object({
  ip: ipSchema,
  reason: z.string().max(500).optional(),
});
router.post(
  '/security/ban',
  validateBody(banSchema),
  asyncHandler(controller.handleBan),
);

/** DELETE /api/security/ban/:ip — 解封 */
const unbanParamsSchema = z.object({
  ip: z.string().min(1),
});
router.delete(
  '/security/ban/:ip',
  validateParams(unbanParamsSchema),
  asyncHandler(controller.handleUnban),
);

/** GET /api/security/policy — 获取封禁策略 */
router.get('/security/policy', asyncHandler(controller.handleGetPolicy));

/** PUT /api/security/policy — 更新封禁策略 */
const policySchema = z.object({
  maxAttempts: z.number().int().min(1).max(100).optional(),
  banDurationHours: z.number().min(0.1).max(8760).optional(),
  whitelist: z.array(ipSchema).max(100).optional(),
});
router.put(
  '/security/policy',
  validateBody(policySchema),
  asyncHandler(controller.handleUpdatePolicy),
);

/** POST /api/security/record-failure — 记录登录失败 */
const recordFailureSchema = z.object({
  ip: ipSchema,
});
router.post(
  '/security/record-failure',
  validateBody(recordFailureSchema),
  asyncHandler(controller.handleRecordFailure),
);

export default router;
