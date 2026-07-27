/**
 * 模块：通知与告警 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './notification.controller.js';

const router: IRouter = Router();
const idSchema = z.object({ id: z.string().min(1) });

router.get('/notifications', asyncHandler(controller.handleList));
router.post('/notifications/:id/read', validateParams(idSchema), asyncHandler(controller.handleMarkRead));
router.post('/notifications/read-all', asyncHandler(controller.handleMarkAllRead));
router.delete('/notifications/:id', validateParams(idSchema), asyncHandler(controller.handleRemove));
router.get('/notifications/settings', asyncHandler(controller.handleGetSettings));

const settingsSchema = z.object({
  channels: z.array(z.object({
    type: z.enum(['webhook', 'email']),
    enabled: z.boolean(),
    url: z.string().optional(),
    minSeverity: z.enum(['info', 'warning', 'critical']),
  })),
});
router.put('/notifications/settings', validateBody(settingsSchema), asyncHandler(controller.handleUpdateSettings));
router.get('/notifications/unread-count', asyncHandler(controller.handleUnreadCount));

export default router;
