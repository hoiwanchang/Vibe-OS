/**
 * 模块：系统设置中心 — 路由定义
 * 注意：具体路径必须在参数化路径 /settings/:section 之前注册
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './settings.controller.js';

const router: IRouter = Router();

/* ---------- 具体路径（必须在 :section 之前） ---------- */

/** GET /api/settings — 完整配置 */
router.get('/settings', asyncHandler(controller.handleGetAll));

/** GET /api/settings/services — 服务列表 */
router.get('/settings/services', asyncHandler(controller.handleListServices));

/** POST /api/settings/services/:name/toggle */
const serviceNameSchema = z.object({ name: z.string().min(1).max(64) });
const toggleBodySchema = z.object({ enabled: z.boolean() });
router.post(
  '/settings/services/:name/toggle',
  validateParams(serviceNameSchema),
  validateBody(toggleBodySchema),
  asyncHandler(controller.handleToggleService),
);

/** POST /api/settings/services/:name/restart */
router.post(
  '/settings/services/:name/restart',
  validateParams(serviceNameSchema),
  asyncHandler(controller.handleRestartService),
);

/** GET /api/settings/about */
router.get('/settings/about', asyncHandler(controller.handleAbout));

/** GET /api/settings/logs/sources */
router.get('/settings/logs/sources', asyncHandler(controller.handleLogSources));

/** GET /api/settings/logs */
router.get('/settings/logs', asyncHandler(controller.handleReadLogs));

/** DELETE /api/settings/logs/clear */
router.delete('/settings/logs/clear', asyncHandler(controller.handleClearLogs));

/** POST /api/settings/logs/export */
router.post('/settings/logs/export', asyncHandler(controller.handleExportDiagnostics));

/** POST /api/settings/update/check */
router.post('/settings/update/check', asyncHandler(controller.handleCheckUpdate));

/** POST /api/settings/notification/test */
const testNotifSchema = z.object({ channelType: z.string().min(1) });
router.post(
  '/settings/notification/test',
  validateBody(testNotifSchema),
  asyncHandler(controller.handleTestNotification),
);

/* ---------- 参数化路径（兜底，必须在所有具体路径之后） ---------- */

const sectionParamSchema = z.object({
  section: z.string().min(1),
});

/** GET /api/settings/:section — 单分区 */
router.get(
  '/settings/:section',
  validateParams(sectionParamSchema),
  asyncHandler(controller.handleGetSection),
);

/** PUT /api/settings/:section — 更新分区 */
router.put(
  '/settings/:section',
  validateParams(sectionParamSchema),
  asyncHandler(controller.handleUpdateSection),
);

/* ---------- 系统电源 ---------- */

/** POST /api/system/reboot */
router.post('/system/reboot', asyncHandler(controller.handleReboot));

/** POST /api/system/shutdown */
router.post('/system/shutdown', asyncHandler(controller.handleShutdown));

export default router;
