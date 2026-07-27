/**
 * 模块5：用户与权限管理 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './user.controller.js';

const router: IRouter = Router();

/** GET /api/users — 受管用户列表 */
router.get('/users', asyncHandler(controller.handleListUsers));

/** POST /api/users — 创建用户数据空间 */
const createUserSchema = z.object({
  username: z.string().min(1).max(32),
  uid: z.number().int().min(1000).max(59999).optional(),
  quotaBytes: z.string().regex(/^\d+$/, '配额必须为正整数字符串').optional(),
});

router.post(
  '/users',
  validateBody(createUserSchema),
  asyncHandler(controller.handleCreateUser),
);

export default router;
