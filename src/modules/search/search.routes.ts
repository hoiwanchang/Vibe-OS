/**
 * 模块：全文搜索 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './search.controller.js';

const router: IRouter = Router();

/** GET /api/search */
router.get('/search', asyncHandler(controller.handleSearch));

/** GET /api/search/status */
router.get('/search/status', asyncHandler(controller.handleStatus));

/** POST /api/search/reindex */
const reindexSchema = z.object({ uid: z.number().int().min(0) });
router.post('/search/reindex', validateBody(reindexSchema), asyncHandler(controller.handleReindex));

export default router;
