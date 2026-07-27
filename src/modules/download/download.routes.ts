/**
 * 模块：下载中心 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './download.controller.js';

const router: IRouter = Router();
const gidSchema = z.object({ gid: z.string().min(1) });

router.get('/download/tasks', asyncHandler(controller.handleListTasks));

const addSchema = z.object({
  urls: z.array(z.string().min(1)).min(1),
  targetDir: z.string().optional(),
  headers: z.record(z.string()).optional(),
});
router.post('/download/tasks', validateBody(addSchema), asyncHandler(controller.handleAddTask));
router.delete('/download/tasks/:gid', validateParams(gidSchema), asyncHandler(controller.handleRemoveTask));
router.post('/download/tasks/:gid/pause', validateParams(gidSchema), asyncHandler(controller.handlePauseTask));
router.post('/download/tasks/:gid/resume', validateParams(gidSchema), asyncHandler(controller.handleResumeTask));
router.get('/download/tasks/:gid', validateParams(gidSchema), asyncHandler(controller.handleGetTask));
router.get('/download/settings', asyncHandler(controller.handleGetSettings));
router.put('/download/settings', asyncHandler(controller.handleUpdateSettings));

export default router;
