/**
 * 模块：链路聚合（LACP/Bonding） — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './lacp.controller.js';

const router: IRouter = Router();

/** GET /api/lacp — Bonding 接口列表 */
router.get('/lacp', asyncHandler(controller.handleListBonds));

/** POST /api/lacp — 创建 Bonding */
const createBondSchema = z.object({
  name: z.string().min(1).max(64),
  mode: z.enum(['balance-rr', 'active-backup', '802.3ad']),
  members: z.array(z.string().min(1)).min(1, '至少需要一个成员网卡'),
});
router.post('/lacp', validateBody(createBondSchema), asyncHandler(controller.handleCreateBond));

/** DELETE /api/lacp/:name — 删除 Bonding */
const bondNameSchema = z.object({ name: z.string().min(1).max(64) });
router.delete('/lacp/:name', validateParams(bondNameSchema), asyncHandler(controller.handleDeleteBond));

/** POST /api/lacp/:name/members — 添加成员网卡 */
const addMemberSchema = z.object({ member: z.string().min(1).max(64) });
router.post('/lacp/:name/members', validateParams(bondNameSchema), validateBody(addMemberSchema), asyncHandler(controller.handleAddMember));

/** DELETE /api/lacp/:name/members/:member — 移除成员网卡 */
const memberParamsSchema = z.object({
  name: z.string().min(1).max(64),
  member: z.string().min(1).max(64),
});
router.delete('/lacp/:name/members/:member', validateParams(memberParamsSchema), asyncHandler(controller.handleRemoveMember));

/** GET /api/lacp/:name/status — Bonding 聚合状态 */
router.get('/lacp/:name/status', validateParams(bondNameSchema), asyncHandler(controller.handleGetBondStatus));

export { router as lacpRoutes };
