/**
 * 模块1：系统初始化 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './system-init.controller.js';

const router: IRouter = Router();

/** POST /api/system/init-data — 初始化数据目录 */
const initDataSchema = z.object({
  force: z.boolean().optional(),
});

router.post(
  '/system/init-data',
  validateBody(initDataSchema),
  asyncHandler(controller.handleInitData),
);

/** GET /api/user/:uid/quota — 查询用户配额 */
const uidParamSchema = z.object({
  uid: z.string().regex(/^\d+$/, 'UID 必须为正整数'),
});

router.get(
  '/user/:uid/quota',
  validateParams(uidParamSchema),
  asyncHandler(controller.handleGetUserQuota),
);

/** POST /api/user/:uid/init — 初始化用户空间 */
const initUserSchema = z.object({
  quotaBytes: z.string().regex(/^\d+$/, '配额必须为正整数字符串').optional(),
});

router.post(
  '/user/:uid/init',
  validateParams(uidParamSchema),
  validateBody(initUserSchema),
  asyncHandler(controller.handleInitUserSpace),
);

export default router;
