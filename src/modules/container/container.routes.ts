/**
 * 模块3：Docker 与 Tailscale 服务编排 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody, validateParams } from '../../common/validate.js';
import * as controller from './container.controller.js';

const router: IRouter = Router();

/** POST /api/container/deploy — 部署容器 */
const deploySchema = z.object({
  name: z.string().min(1).max(128),
  image: z.string().min(1).max(512),
  ports: z
    .array(
      z.object({
        host: z.number().int().min(1).max(65535),
        container: z.number().int().min(1).max(65535),
      }),
    )
    .optional(),
  env: z.record(z.string()).optional(),
  volumes: z
    .array(
      z.object({
        host: z.string().min(1),
        container: z.string().min(1),
        readonly: z.boolean().optional(),
      }),
    )
    .optional(),
  memoryLimit: z.string().optional(),
  cpuLimit: z.number().positive().optional(),
  restartPolicy: z
    .enum(['no', 'always', 'unless-stopped', 'on-failure'])
    .optional(),
  network: z.string().optional(),
});

router.post(
  '/container/deploy',
  validateBody(deploySchema),
  asyncHandler(controller.handleDeploy),
);

/** GET /api/container/list — 容器列表 */
router.get('/container/list', asyncHandler(controller.handleList));

/** 容器名参数校验 */
const containerNameSchema = z.object({
  name: z.string().min(1).max(128),
});

/** POST /api/container/:name/restart — 重启容器 */
router.post(
  '/container/:name/restart',
  validateParams(containerNameSchema),
  asyncHandler(controller.handleRestart),
);

/** POST /api/container/:name/stop — 停止容器 */
router.post(
  '/container/:name/stop',
  validateParams(containerNameSchema),
  asyncHandler(controller.handleStop),
);

/** DELETE /api/container/:name — 删除容器 */
router.delete(
  '/container/:name',
  validateParams(containerNameSchema),
  asyncHandler(controller.handleRemove),
);

/** GET /api/container/:name/logs — 容器日志 */
router.get(
  '/container/:name/logs',
  validateParams(containerNameSchema),
  asyncHandler(controller.handleLogs),
);

/** GET /api/tailscale/status — Tailscale 状态 */
router.get('/tailscale/status', asyncHandler(controller.handleTailscaleStatus));

/** POST /api/tailscale/subnet-router — 配置 Subnet Router */
const subnetSchema = z.object({
  subnets: z.array(z.string()).min(1),
});

router.post(
  '/tailscale/subnet-router',
  validateBody(subnetSchema),
  asyncHandler(controller.handleSubnetRouter),
);

/** POST /api/tailscale/acl — 下发 ACL 策略 */
router.post('/tailscale/acl', asyncHandler(controller.handleAclPolicy));

export default router;
