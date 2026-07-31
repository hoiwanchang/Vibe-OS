/**
 * 模块：UPS 电源管理（NUT） — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './ups.controller.js';

const router: IRouter = Router();

/** GET /api/ups/status — UPS 实时状态 */
router.get('/ups/status', asyncHandler(controller.handleGetStatus));

/** GET /api/ups/config — 当前配置 */
router.get('/ups/config', asyncHandler(controller.handleGetConfig));

/** PUT /api/ups/config — 更新配置 */
const updateConfigSchema = z.object({
  shutdownThreshold: z
    .number()
    .min(1, '关机阈值最小为 1%')
    .max(100, '关机阈值最大为 100%'),
  notifyEmail: z.string().email('邮箱格式不正确').optional(),
});
router.put(
  '/ups/config',
  validateBody(updateConfigSchema),
  asyncHandler(controller.handleUpdateConfig),
);

/** POST /api/ups/test-shutdown — 模拟关机测试 */
router.post(
  '/ups/test-shutdown',
  asyncHandler(controller.handleTestShutdown),
);

/** GET /api/ups/history — 事件历史 */
router.get('/ups/history', asyncHandler(controller.handleGetHistory));

export { router as upsRoutes };
