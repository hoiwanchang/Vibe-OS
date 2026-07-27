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

/** GET /api/tailscale/manage — Tailscale 管理综合报告（状态+账户+偏好） */
router.get('/tailscale/manage', asyncHandler(controller.handleTailscaleManage));

/** POST /api/tailscale/login — 登录控制平面（支持 headscale） */
const tailscaleLoginSchema = z.object({
  controlUrl: z.string().max(512).optional(),
  authKey: z.string().max(512).optional(),
  label: z.string().max(128).optional(),
  exitNode: z.boolean().optional(),
  acceptRoutes: z.boolean().optional(),
});

router.post(
  '/tailscale/login',
  validateBody(tailscaleLoginSchema),
  asyncHandler(controller.handleTailscaleLogin),
);

/** POST /api/tailscale/logout — 登出当前账户 */
router.post('/tailscale/logout', asyncHandler(controller.handleTailscaleLogout));

/** 账户 id 参数校验 */
const accountIdSchema = z.object({
  id: z.string().min(1).max(128),
});

/** POST /api/tailscale/accounts/:id/switch — 切换激活账户 */
router.post(
  '/tailscale/accounts/:id/switch',
  validateParams(accountIdSchema),
  asyncHandler(controller.handleTailscaleSwitchAccount),
);

/** DELETE /api/tailscale/accounts/:id — 移除已登记账户 */
router.delete(
  '/tailscale/accounts/:id',
  validateParams(accountIdSchema),
  asyncHandler(controller.handleTailscaleRemoveAccount),
);

/** POST /api/tailscale/prefs — 应用偏好设置（exit node 等） */
const tailscalePrefsSchema = z.object({
  acceptRoutes: z.boolean().optional(),
  exitNode: z.string().max(64).optional(),
  exitNodeAllowLanAccess: z.boolean().optional(),
  advertiseExitNode: z.boolean().optional(),
});

router.post(
  '/tailscale/prefs',
  validateBody(tailscalePrefsSchema),
  asyncHandler(controller.handleTailscalePrefs),
);

/** POST /api/container/init-dirs — 初始化 AI 应用数据目录 */
const appDirsSchema = z.object({
  appname: z.string().min(1).max(128),
});

router.post(
  '/container/init-dirs',
  validateBody(appDirsSchema),
  asyncHandler(controller.handleInitAppDirs),
);

export default router;
