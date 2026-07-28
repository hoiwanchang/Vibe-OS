/**
 * 应用中心模块 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './apps.controller.js';

const router: IRouter = Router();

/* ---------- 注册表 ---------- */

/** GET /api/apps/registry — 注册表列表 */
router.get('/apps/registry', asyncHandler(controller.handleRegistry));

/** GET /api/apps/registry/:id — 单个注册表应用 */
const appIdSchema = z.object({ id: z.string().min(1).max(128) });
router.get(
  '/apps/registry/:id',
  validateParams(appIdSchema),
  asyncHandler(controller.handleRegistryDetail),
);

/* ---------- 部署 ---------- */

/** POST /api/apps/deploy — 从注册表部署 */
const deployRegistrySchema = z.object({
  appId: z.string().min(1).max(128),
  ports: z
    .array(z.object({
      host: z.number().int().min(1).max(65535),
      container: z.number().int().min(1).max(65535),
      protocol: z.enum(['tcp', 'udp']).optional(),
    }))
    .optional(),
  env: z.record(z.string()).optional(),
  volumes: z
    .array(z.object({
      host: z.string().min(1),
      container: z.string().min(1),
      readonly: z.boolean().optional(),
    }))
    .optional(),
  memoryLimit: z.string().optional(),
  cpuLimit: z.number().positive().optional(),
});

router.post(
  '/apps/deploy',
  validateBody(deployRegistrySchema),
  asyncHandler(controller.handleDeployRegistry),
);

/** POST /api/apps/deploy-custom — 自定义部署 */
const deployCustomSchema = z.object({
  name: z.string().min(1).max(128),
  image: z.string().min(1).max(512),
  ports: z
    .array(z.object({
      host: z.number().int().min(1).max(65535),
      container: z.number().int().min(1).max(65535),
      protocol: z.enum(['tcp', 'udp']).optional(),
    }))
    .optional(),
  volumes: z
    .array(z.object({
      host: z.string().min(1),
      container: z.string().min(1),
      readonly: z.boolean().optional(),
    }))
    .optional(),
  env: z.record(z.string()).optional(),
  memoryLimit: z.string().optional(),
  cpuLimit: z.number().positive().optional(),
  restartPolicy: z.enum(['no', 'always', 'unless-stopped', 'on-failure']).optional(),
  gitUrl: z.string().max(512).optional(),
});

router.post(
  '/apps/deploy-custom',
  validateBody(deployCustomSchema),
  asyncHandler(controller.handleDeployCustom),
);

/* ---------- 已安装应用 ---------- */

/** GET /api/apps/installed — 已安装应用列表 */
router.get('/apps/installed', asyncHandler(controller.handleInstalled));

/** DELETE /api/apps/installed/:id — 卸载应用 */
router.delete(
  '/apps/installed/:id',
  validateParams(appIdSchema),
  asyncHandler(controller.handleUninstall),
);

/** POST /api/apps/installed/:id/restart — 重启应用 */
router.post(
  '/apps/installed/:id/restart',
  validateParams(appIdSchema),
  asyncHandler(controller.handleRestart),
);

/** POST /api/apps/installed/:id/stop — 停止应用 */
router.post(
  '/apps/installed/:id/stop',
  validateParams(appIdSchema),
  asyncHandler(controller.handleStop),
);

/* ---------- LLM 配置 ---------- */

/** GET /api/apps/llm-config — 获取 LLM 配置 */
router.get('/apps/llm-config', asyncHandler(controller.handleGetLlmConfig));

/** PUT /api/apps/llm-config — 保存 LLM 配置 */
const llmConfigSchema = z.object({
  endpoint: z.string().min(1).max(512),
  apiKey: z.string().min(1).max(512),
  model: z.string().min(1).max(128),
  maxTokens: z.number().int().min(256).max(32768).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

router.put(
  '/apps/llm-config',
  validateBody(llmConfigSchema),
  asyncHandler(controller.handleSetLlmConfig),
);

/* ---------- LLM 仓库分析 ---------- */

/** POST /api/apps/analyze — 分析 Git 仓库 */
const analyzeSchema = z.object({
  gitUrl: z.string().min(1).max(512),
  branch: z.string().max(128).optional(),
});

router.post(
  '/apps/analyze',
  validateBody(analyzeSchema),
  asyncHandler(controller.handleAnalyze),
);

export default router;
