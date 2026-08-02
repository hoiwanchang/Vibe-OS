/**
 * 模块：动态 DNS — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './ddns.controller.js';

const router: IRouter = Router();

/** GET /api/ddns/status — DDNS 状态 */
router.get('/ddns/status', asyncHandler(controller.handleGetStatus));

/** PUT /api/ddns/config — 更新配置 */
const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  intervalMinutes: z.number().int().min(0).max(1440).optional(),
  ipCheckUrls: z.array(z.string().url()).max(10).optional(),
  records: z
    .array(
      z.object({
        id: z.string(),
        enabled: z.boolean(),
        provider: z.enum(['cloudflare', 'aliyun', 'custom']),
        domain: z.string().min(1).max(253),
        subdomain: z.string().min(1).max(253),
        recordType: z.enum(['A', 'AAAA']),
        credentials: z.record(z.string()),
        custom: z
          .object({
            url: z.string().url(),
            method: z.enum(['GET', 'POST', 'PUT']),
            headers: z.record(z.string()).optional(),
            bodyTemplate: z.string().max(4096).optional(),
          })
          .optional(),
        lastIp: z.string().nullable(),
        lastUpdated: z.string().nullable(),
        lastStatus: z.enum(['success', 'failed', 'skipped']).nullable(),
      }),
    )
    .optional(),
});
router.put(
  '/ddns/config',
  validateBody(updateConfigSchema),
  asyncHandler(controller.handleUpdateConfig),
);

/** POST /api/ddns/update — 手动触发更新 */
router.post('/ddns/update', asyncHandler(controller.handleUpdate));

/** GET /api/ddns/history — 更新历史 */
router.get('/ddns/history', asyncHandler(controller.handleGetHistory));

export default router;
