/**
 * 模块：VLAN 管理 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './vlan.controller.js';

const router: IRouter = Router();

/** GET /api/vlan — VLAN 列表 */
router.get('/vlan', asyncHandler(controller.handleListVlans));

/** POST /api/vlan — 创建 VLAN */
const createVlanSchema = z.object({
  parentInterface: z.string().min(1).max(64),
  vlanId: z.number().int().min(1).max(4094),
  ipAddress: z.string().optional(),
});
router.post('/vlan', validateBody(createVlanSchema), asyncHandler(controller.handleCreateVlan));

/** DELETE /api/vlan/:id — 删除 VLAN */
const vlanIdSchema = z.object({ id: z.string().min(1).max(64) });
router.delete('/vlan/:id', validateParams(vlanIdSchema), asyncHandler(controller.handleDeleteVlan));

/** PUT /api/vlan/:id — 更新 VLAN（改 IP） */
const updateVlanSchema = z.object({
  ipAddress: z.string().min(1),
});
router.put('/vlan/:id', validateParams(vlanIdSchema), validateBody(updateVlanSchema), asyncHandler(controller.handleUpdateVlan));

export { router as vlanRoutes };
