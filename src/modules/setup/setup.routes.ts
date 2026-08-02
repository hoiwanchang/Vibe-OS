/**
 * 模块：安装向导 — 路由
 */
import { Router, type Router as IRouter } from 'express';
import { asyncHandler } from '../../common/async-handler.js';
import * as controller from './setup.controller.js';

const router: IRouter = Router();

router.get('/setup/status', asyncHandler(controller.handleGetStatus));
router.get('/setup/disks', asyncHandler(controller.handleListDisks));
router.post('/setup/complete', asyncHandler(controller.handleComplete));

export { router as setupRoutes };
