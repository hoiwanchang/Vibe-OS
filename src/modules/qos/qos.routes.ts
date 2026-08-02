/**
 * 模块：QoS 带宽控制 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './qos.controller.js';

const router: IRouter = Router();

/** GET /api/qos/rules — QoS 规则列表 */
router.get('/qos/rules', asyncHandler(controller.handleListRules));

/** POST /api/qos/rules — 创建 QoS 规则 */
const createRuleSchema = z.object({
  interface: z.string().min(1, '接口名不能为空'),
  type: z.enum(['ip', 'port', 'protocol']),
  target: z.string().min(1, '匹配目标不能为空'),
  direction: z.enum(['ingress', 'egress']),
  rateLimit: z.string().min(1, '速率限制不能为空'),
  priority: z.number().int().min(1).max(100).optional(),
});
router.post('/qos/rules', validateBody(createRuleSchema), asyncHandler(controller.handleCreateRule));

/** DELETE /api/qos/rules/:id — 删除 QoS 规则 */
router.delete('/qos/rules/:id', asyncHandler(controller.handleDeleteRule));

/** GET /api/qos/status — 接口流量统计 */
router.get('/qos/status', asyncHandler(controller.handleGetStatus));

export { router as qosRoutes };
