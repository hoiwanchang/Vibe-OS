/**
 * 模块：备份与快照 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './backup.controller.js';

const router: IRouter = Router();
const idSchema = z.object({ id: z.string().min(1) });

router.get('/backup/jobs', asyncHandler(controller.handleListJobs));

const createJobSchema = z.object({
  name: z.string().min(1).max(128),
  source: z.string().min(1),
  target: z.string().min(1),
  schedule: z.string().optional(),
  type: z.enum(['rsync', 'snapshot', 'archive']),
});
router.post('/backup/jobs', validateBody(createJobSchema), asyncHandler(controller.handleCreateJob));
router.post('/backup/jobs/:id/run', validateParams(idSchema), asyncHandler(controller.handleRunJob));
router.delete('/backup/jobs/:id', validateParams(idSchema), asyncHandler(controller.handleDeleteJob));
router.get('/backup/jobs/:id/history', validateParams(idSchema), asyncHandler(controller.handleHistory));

const restoreSchema = z.object({ executionId: z.string().min(1), targetPath: z.string().optional() });
router.post('/backup/jobs/:id/restore', validateParams(idSchema), validateBody(restoreSchema), asyncHandler(controller.handleRestore));

router.get('/backup/snapshots', asyncHandler(controller.handleListSnapshots));

const createSnapSchema = z.object({ pool: z.string().min(1), name: z.string().min(1) });
router.post('/backup/snapshots', validateBody(createSnapSchema), asyncHandler(controller.handleCreateSnapshot));

const snapNameSchema = z.object({ name: z.string().min(1) });
router.delete('/backup/snapshots/:name', validateParams(snapNameSchema), asyncHandler(controller.handleDeleteSnapshot));

export default router;
