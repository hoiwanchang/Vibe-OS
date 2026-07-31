/**
 * 模块：DNS 服务器 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './dns.controller.js';

const router: IRouter = Router();

/** GET /api/dns/status — dnsmasq 服务状态 */
router.get('/dns/status', asyncHandler(controller.handleGetStatus));

/** GET /api/dns/records — 自定义 DNS 记录列表 */
router.get('/dns/records', asyncHandler(controller.handleListRecords));

/** POST /api/dns/records — 添加 DNS 记录 */
const addRecordSchema = z.object({
  type: z.enum(['A', 'CNAME', 'PTR']),
  name: z.string().min(1, '主机名不能为空'),
  value: z.string().min(1, '记录值不能为空'),
  ttl: z.number().int().min(1).optional(),
});
router.post('/dns/records', validateBody(addRecordSchema), asyncHandler(controller.handleAddRecord));

/** DELETE /api/dns/records/:id — 删除 DNS 记录 */
router.delete('/dns/records/:id', asyncHandler(controller.handleDeleteRecord));

/** PUT /api/dns/config — 更新上游 DNS 配置 */
const updateConfigSchema = z.object({
  upstreamServers: z.array(z.string().min(1)).min(1, '至少需要一个上游 DNS'),
  listenAddress: z.string().optional(),
  cacheSize: z.number().int().min(0).optional(),
});
router.put('/dns/config', validateBody(updateConfigSchema), asyncHandler(controller.handleUpdateConfig));

/** GET /api/dns/config — 获取当前配置 */
router.get('/dns/config', asyncHandler(controller.handleGetConfig));

export { router as dnsRoutes };
