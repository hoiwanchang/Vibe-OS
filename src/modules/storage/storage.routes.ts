/**
 * 模块：存储池管理 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './storage.controller.js';

const router: IRouter = Router();

router.get('/storage/disks', asyncHandler(controller.handleListDisks));
router.get('/storage/pools', asyncHandler(controller.handleListPools));

const createPoolSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  level: z.enum(['raid0', 'raid1', 'raid5', 'raid6', 'raid10', 'jbod']),
  disks: z.array(z.string().min(1)).min(1),
});
router.post('/storage/pools', validateBody(createPoolSchema), asyncHandler(controller.handleCreatePool));

const poolNameSchema = z.object({ name: z.string().min(1).max(64) });
router.delete('/storage/pools/:name', validateParams(poolNameSchema), asyncHandler(controller.handleDestroyPool));

const expandSchema = z.object({ disks: z.array(z.string().min(1)).min(1) });
router.post('/storage/pools/:name/expand', validateParams(poolNameSchema), validateBody(expandSchema), asyncHandler(controller.handleExpandPool));
router.get('/storage/pools/:name/smart', validateParams(poolNameSchema), asyncHandler(controller.handlePoolSmart));
router.post('/storage/pools/:name/scrub', validateParams(poolNameSchema), asyncHandler(controller.handleStartScrub));
router.get('/storage/pools/:name/scrub/status', validateParams(poolNameSchema), asyncHandler(controller.handleScrubStatus));

export default router;
