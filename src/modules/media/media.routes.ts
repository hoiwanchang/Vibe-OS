/**
 * 模块：DLNA/UPnP 媒体服务器 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './media.controller.js';

const router: IRouter = Router();

/** GET /api/media/status — DLNA 服务状态 */
router.get('/media/status', asyncHandler(controller.handleGetStatus));

/** PUT /api/media/config — 更新媒体库配置 */
const mediaConfigSchema = z.object({
  sources: z.array(z.object({
    path: z.string().min(1, '路径不能为空'),
    type: z.enum(['video', 'music', 'photo']),
  })).min(1, '至少需要一个媒体源'),
  inotify: z.boolean(),
  port: z.number().int().min(1).max(65535),
});
router.put('/media/config', validateBody(mediaConfigSchema), asyncHandler(controller.handleUpdateConfig));

/** POST /api/media/rescan — 触发重新扫描 */
router.post('/media/rescan', asyncHandler(controller.handleRescan));

/** GET /api/media/clients — 已连接客户端列表 */
router.get('/media/clients', asyncHandler(controller.handleGetClients));

export default router;
