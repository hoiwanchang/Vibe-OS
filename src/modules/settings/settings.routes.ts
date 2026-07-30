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
router.get('/settings/logs/sources', controller.handleLogSources);

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

/* ---------- TLS 证书管理（必须在 :section 之前） ---------- */

/** GET /api/settings/cert — 证书状态 */
router.get('/settings/cert', asyncHandler(controller.handleGetCertStatus));

/** POST /api/settings/cert/generate — 生成自签证书 */
const generateCertSchema = z.object({
  commonName: z.string().max(253).default(''),
  sans: z.array(z.string().max(253)).max(20).default([]),
  days: z.number().int().min(1).max(3650).default(825),
  keySize: z.union([z.literal(2048), z.literal(4096)]).default(2048),
});
router.post(
  '/settings/cert/generate',
  validateBody(generateCertSchema),
  asyncHandler(controller.handleGenerateCert),
);

/** POST /api/settings/cert/import — 导入证书 */
const importCertSchema = z.object({
  certPem: z.string().min(1).max(64 * 1024),
  keyPem: z.string().min(1).max(64 * 1024),
});
router.post(
  '/settings/cert/import',
  validateBody(importCertSchema),
  asyncHandler(controller.handleImportCert),
);

/** DELETE /api/settings/cert — 删除证书 */
router.delete('/settings/cert', asyncHandler(controller.handleDeleteCert));

/* ---------- SSH 密钥管理（必须在 :section 之前） ---------- */

/** GET /api/settings/ssh/keys — 列举公钥 */
router.get('/settings/ssh/keys', asyncHandler(controller.handleListSshKeys));

/** POST /api/settings/ssh/keys — 导入公钥 */
const importSshKeySchema = z.object({
  publicKey: z.string().min(1).max(16 * 1024),
});
router.post(
  '/settings/ssh/keys',
  validateBody(importSshKeySchema),
  asyncHandler(controller.handleImportSshKey),
);

/** DELETE /api/settings/ssh/keys — 删除公钥（按指纹） */
router.delete('/settings/ssh/keys', asyncHandler(controller.handleDeleteSshKey));

/** POST /api/settings/ssh/keys/generate — 生成密钥对 */
const generateSshKeySchema = z.object({
  type: z.union([z.literal('ed25519'), z.literal('rsa')]).default('ed25519'),
  bits: z.union([z.literal(2048), z.literal(4096)]).optional(),
  comment: z.string().max(256).optional(),
});
router.post(
  '/settings/ssh/keys/generate',
  validateBody(generateSshKeySchema),
  asyncHandler(controller.handleGenerateSshKey),
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
