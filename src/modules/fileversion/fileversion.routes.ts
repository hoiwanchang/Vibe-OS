/**
 * 模块：文件版本控制 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './fileversion.controller.js';

const router: IRouter = Router();

/** GET /api/files/versions — 列出版本历史 */
router.get('/files/versions', asyncHandler(controller.handleList));

/** GET /api/files/versions/download — 下载指定版本 */
router.get('/files/versions/download', asyncHandler(controller.handleDownload));

/** POST /api/files/versions/restore — 恢复指定版本 */
const restoreSchema = z.object({
  uid: z.number().int().min(0),
  path: z.string().min(1),
  version: z.number().int().min(1),
});
router.post('/files/versions/restore', validateBody(restoreSchema), asyncHandler(controller.handleRestore));

/** DELETE /api/files/versions — 删除指定版本 */
router.delete('/files/versions', asyncHandler(controller.handleDelete));

/** GET /api/files/versions/policy — 获取策略 */
router.get('/files/versions/policy', asyncHandler(controller.handleGetPolicy));

/** PUT /api/files/versions/policy — 设置策略 */
const policySchema = z.object({
  share: z.string().min(1),
  mode: z.enum(['off', 'simple', 'multiversion']).optional(),
  maxVersions: z.number().int().min(1).optional(),
  maxDays: z.number().int().min(0).optional(),
});
router.put('/files/versions/policy', validateBody(policySchema), asyncHandler(controller.handleSetPolicy));

export default router;
