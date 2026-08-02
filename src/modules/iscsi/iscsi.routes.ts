/**
 * 模块：iSCSI Target 管理 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './iscsi.controller.js';

const router: IRouter = Router();

/** GET /api/iscsi/targets — 列出所有 Target */
router.get('/iscsi/targets', asyncHandler(controller.handleListTargets));

/** POST /api/iscsi/targets — 创建 Target */
const createTargetSchema = z.object({
  iqn: z.string().regex(/^iqn\./, 'IQN 必须以 iqn. 开头'),
  luns: z.array(z.object({
    backingStore: z.string().min(1),
    sizeBytes: z.number().int().positive().optional(),
  })).min(1, '至少需要一个 LUN'),
  chapUser: z.string().optional(),
  chapPassword: z.string().optional(),
  initiatorWhitelist: z.array(z.string()).optional(),
});
router.post('/iscsi/targets', validateBody(createTargetSchema), asyncHandler(controller.handleCreateTarget));

/** DELETE /api/iscsi/targets/:iqn — 删除 Target */
router.delete('/iscsi/targets/:iqn', asyncHandler(controller.handleDeleteTarget));

/** GET /iscsi/targets/:iqn — Target 详情 */
router.get('/iscsi/targets/:iqn', asyncHandler(controller.handleGetTarget));

/** POST /api/iscsi/targets/:iqn/lun — 添加 LUN */
const addLunSchema = z.object({
  backingStore: z.string().min(1),
  sizeBytes: z.number().int().positive().optional(),
});
router.post('/iscsi/targets/:iqn/lun', validateBody(addLunSchema), asyncHandler(controller.handleAddLun));

/** DELETE /api/iscsi/targets/:iqn/lun/:lunId — 移除 LUN */
router.delete('/iscsi/targets/:iqn/lun/:lunId', asyncHandler(controller.handleRemoveLun));

export default router;
