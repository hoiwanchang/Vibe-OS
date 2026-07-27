/**
 * 模块：共享文件夹 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './sharing.controller.js';

const router: IRouter = Router();
const nameSchema = z.object({ name: z.string().min(1).max(128) });

router.get('/sharing', asyncHandler(controller.handleList));

const createSchema = z.object({
  name: z.string().min(1).max(128),
  path: z.string().min(1),
  protocol: z.enum(['smb', 'nfs', 'webdav']),
  readonly: z.boolean(),
  validUsers: z.array(z.string()).optional(),
  hosts: z.array(z.string()).optional(),
  port: z.number().int().min(1).max(65535).optional(),
});
router.post('/sharing', validateBody(createSchema), asyncHandler(controller.handleCreate));
router.put('/sharing/:name', validateParams(nameSchema), asyncHandler(controller.handleUpdate));
router.delete('/sharing/:name', validateParams(nameSchema), asyncHandler(controller.handleRemove));
router.get('/sharing/:name/status', validateParams(nameSchema), asyncHandler(controller.handleStatus));
router.post('/sharing/:name/restart', validateParams(nameSchema), asyncHandler(controller.handleRestart));

export default router;
