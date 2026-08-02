/**
 * 模块：审计日志 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './audit.controller.js';

const router: IRouter = Router();

/** GET /api/audit/logs — 分页查询审计日志 */
router.get('/audit/logs', asyncHandler(controller.handleQueryLogs));

/** GET /api/audit/stats — 今日统计 */
router.get('/audit/stats', asyncHandler(controller.handleStats));

/** POST /api/audit/export — 导出 CSV/JSON */
const exportSchema = z.object({
  format: z.enum(['csv', 'json']),
  user: z.string().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
router.post('/audit/export', validateBody(exportSchema), asyncHandler(controller.handleExport));

/** POST /api/audit/rotate — 手动触发轮转 */
router.post('/audit/rotate', asyncHandler(controller.handleRotate));

export default router;
