/**
 * 模块：视频转码 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './transcode.controller.js';

const router: IRouter = Router();

/** GET /api/transcode/tasks — 转码任务列表 */
router.get('/transcode/tasks', asyncHandler(controller.handleListTasks));

/** POST /api/transcode/tasks — 创建转码任务 */
const createTaskSchema = z.object({
  inputPath: z.string().min(1, '输入路径不能为空'),
  outputPath: z.string().optional(),
  preset: z.enum(['1080p', '720p', '480p', 'original']),
  hwAccel: z.enum(['auto', 'vaapi', 'nvenc', 'none']).optional(),
});
router.post('/transcode/tasks', validateBody(createTaskSchema), asyncHandler(controller.handleCreateTask));

/** GET /api/transcode/tasks/:id — 任务详情 */
router.get('/transcode/tasks/:id', asyncHandler(controller.handleGetTask));

/** DELETE /api/transcode/tasks/:id — 取消/删除任务 */
router.delete('/transcode/tasks/:id', asyncHandler(controller.handleDeleteTask));

/** GET /api/transcode/hwaccel — 检测硬件加速 */
router.get('/transcode/hwaccel', asyncHandler(controller.handleDetectHwAccel));

export default router;
