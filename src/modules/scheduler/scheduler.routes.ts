/**
 * 模块：计划任务 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './scheduler.controller.js';

const router: IRouter = Router();
const idSchema = z.object({ id: z.string().min(1) });

router.get('/scheduler/jobs', asyncHandler(controller.handleListJobs));

const createSchema = z.object({
  name: z.string().min(1).max(128),
  command: z.string().min(1),
  schedule: z.string().min(1),
  enabled: z.boolean().optional(),
});
router.post('/scheduler/jobs', validateBody(createSchema), asyncHandler(controller.handleCreateJob));
router.put('/scheduler/jobs/:id', validateParams(idSchema), asyncHandler(controller.handleUpdateJob));
router.delete('/scheduler/jobs/:id', validateParams(idSchema), asyncHandler(controller.handleDeleteJob));
router.post('/scheduler/jobs/:id/run', validateParams(idSchema), asyncHandler(controller.handleRunJob));
router.get('/scheduler/jobs/:id/history', validateParams(idSchema), asyncHandler(controller.handleHistory));

export default router;
