/**
 * 模块：应用自动更新 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './appupdate.controller.js';

const router: IRouter = Router();

/* GET /api/appupdate/status — 更新服务状态 */
router.get('/appupdate/status', asyncHandler(controller.handleGetStatus));

/* PUT /api/appupdate/config — 更新策略 */
const configSchema = z.object({
  mode: z.enum(['manual', 'auto']),
  maintenanceWindow: z.string().max(128).optional(),
});
router.put(
  '/appupdate/config',
  validateBody(configSchema),
  asyncHandler(controller.handleUpdateConfig),
);

/* POST /api/appupdate/check — 检查更新 */
router.post('/appupdate/check', asyncHandler(controller.handleCheck));

/* GET /api/appupdate/available — 可用更新列表 */
router.get(
  '/appupdate/available',
  asyncHandler(controller.handleGetAvailable),
);

/* POST /api/appupdate/apply/:appId — 应用更新 */
const appIdSchema = z.object({ appId: z.string().min(1) });
router.post(
  '/appupdate/apply/:appId',
  validateParams(appIdSchema),
  asyncHandler(controller.handleApply),
);

/* GET /api/appupdate/history — 更新历史 */
router.get('/appupdate/history', asyncHandler(controller.handleGetHistory));

export default router;
