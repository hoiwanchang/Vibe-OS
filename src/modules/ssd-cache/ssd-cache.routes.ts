/**
 * 模块：SSD 缓存管理 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './ssd-cache.controller.js';

const router: IRouter = Router();

/** POST /api/ssd-cache/create — 创建 SSD 缓存 */
const createSchema = z.object({
  ssdDevice: z.string().min(1),
  poolDevice: z.string().min(1),
  mode: z.enum(['read', 'write', 'readwrite']),
});
router.post('/ssd-cache/create', validateBody(createSchema), asyncHandler(controller.handleCreate));

/** GET /api/ssd-cache/status — 缓存状态列表 */
router.get('/ssd-cache/status', asyncHandler(controller.handleGetStatus));

/** DELETE /api/ssd-cache/:name — 移除缓存 */
router.delete('/ssd-cache/:name', asyncHandler(controller.handleRemove));

/** GET /api/ssd-cache/:name — 单个缓存详情 */
router.get('/ssd-cache/:name', asyncHandler(controller.handleGetDetail));

export default router;
