/**
 * 模块3：Docker 与 Tailscale 服务编排 — 控制器层
 * 处理 HTTP 请求/响应，调用 service 层
 */
import type { Request, Response } from 'express';
import * as service from './container.service.js';
import type { ContainerDeployRequest } from './container.types.js';

/**
 * POST /api/container/deploy
 * 部署 AI 应用容器
 */
export async function handleDeploy(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as ContainerDeployRequest;
  const result = await service.deployApp(body);
  res.status(201).json({ success: true, data: result });
}

/**
 * POST /api/container/:name/restart
 * 重启容器
 */
export async function handleRestart(
  req: Request,
  res: Response,
): Promise<void> {
  const name = String(req.params['name'] ?? '');
  await service.restartApp(name);
  res.json({ success: true, data: { name, status: 'restarted' } });
}

/**
 * POST /api/container/:name/stop
 * 停止容器
 */
export async function handleStop(
  req: Request,
  res: Response,
): Promise<void> {
  const name = String(req.params['name'] ?? '');
  await service.stopApp(name);
  res.json({ success: true, data: { name, status: 'stopped' } });
}

/**
 * DELETE /api/container/:name
 * 删除容器
 */
export async function handleRemove(
  req: Request,
  res: Response,
): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const force = req.query['force'] === 'true';
  await service.removeApp(name, force);
  res.json({ success: true, data: { name, status: 'removed' } });
}

/**
 * GET /api/container/list
 * 获取容器列表
 */
export async function handleList(
  req: Request,
  res: Response,
): Promise<void> {
  const all = req.query['all'] !== 'false';
  const containers = await service.listApps(all);
  res.json({ success: true, data: containers });
}

/**
 * GET /api/container/:name/logs
 * 读取容器日志
 */
export async function handleLogs(
  req: Request,
  res: Response,
): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const tailRaw = req.query['tail'];
  const tail = typeof tailRaw === 'string' ? parseInt(tailRaw, 10) : 100;
  const sinceRaw = req.query['since'];
  const since = typeof sinceRaw === 'string' ? sinceRaw : undefined;
  const logs = await service.getAppLogs(name, tail, since);
  res.json({ success: true, data: logs });
}

/**
 * GET /api/tailscale/status
 * 获取 Tailscale 节点状态
 */
export async function handleTailscaleStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const report = await service.getTailscaleReport();
  res.json({ success: true, data: report });
}

/**
 * POST /api/tailscale/subnet-router
 * 配置 Subnet Router
 */
export async function handleSubnetRouter(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as { subnets?: string[] };
  const subnets: string[] = body.subnets ?? [];
  await service.setupSubnetRouting(subnets);
  res.json({ success: true, data: { subnets, status: 'configured' } });
}

/**
 * POST /api/tailscale/acl
 * 下发 ACL 策略
 */
export async function handleAclPolicy(
  req: Request,
  res: Response,
): Promise<void> {
  const policy = JSON.stringify(req.body ?? {});
  await service.pushAcl(policy);
  res.json({ success: true, data: { status: 'applied' } });
}

/**
 * POST /api/container/init-dirs
 * 初始化 AI 应用数据目录（/data/vibeos/{appname}/）
 */
export async function handleInitAppDirs(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as { appname?: string };
  const appname = String(body.appname ?? '');
  const result = await service.initAppDirs(appname);
  res.status(201).json({ success: true, data: result });
}

/* ---------- Tailscale 多账户 / HeadScale 管理 ---------- */

/**
 * GET /api/tailscale/manage
 * 获取 Tailscale 管理综合报告（状态 + 账户列表 + 偏好设置）
 */
export async function handleTailscaleManage(
  _req: Request,
  res: Response,
): Promise<void> {
  const report = await service.getTailscaleManageReport();
  res.json({ success: true, data: report });
}

/**
 * POST /api/tailscale/login
 * 登录 Tailscale 控制平面（支持第三方 headscale 服务器）
 */
export async function handleTailscaleLogin(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as {
    controlUrl?: string;
    authKey?: string;
    label?: string;
    exitNode?: boolean;
    acceptRoutes?: boolean;
  };
  const result = await service.loginTailscale({
    controlUrl: body.controlUrl,
    authKey: body.authKey,
    label: body.label,
    exitNode: body.exitNode,
    acceptRoutes: body.acceptRoutes,
  });
  res.json({ success: true, data: result });
}

/**
 * POST /api/tailscale/logout
 * 登出当前 Tailscale 账户
 */
export async function handleTailscaleLogout(
  _req: Request,
  res: Response,
): Promise<void> {
  await service.logoutTailscale();
  res.json({ success: true, data: { status: 'logged-out' } });
}

/**
 * POST /api/tailscale/accounts/:id/switch
 * 切换激活账户
 */
export async function handleTailscaleSwitchAccount(
  req: Request,
  res: Response,
): Promise<void> {
  const accountId = String(req.params['id'] ?? '');
  const result = await service.switchTailscaleAccount(accountId);
  res.json({ success: true, data: result });
}

/**
 * DELETE /api/tailscale/accounts/:id
 * 移除已登记账户
 */
export async function handleTailscaleRemoveAccount(
  req: Request,
  res: Response,
): Promise<void> {
  const accountId = String(req.params['id'] ?? '');
  await service.removeTailscaleAccount(accountId);
  res.json({ success: true, data: { status: 'removed' } });
}

/**
 * POST /api/tailscale/prefs
 * 应用 Tailscale 偏好设置（exit node / accept routes 等）
 */
export async function handleTailscalePrefs(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as {
    acceptRoutes?: boolean;
    exitNode?: string;
    exitNodeAllowLanAccess?: boolean;
    advertiseExitNode?: boolean;
  };
  await service.setTailscalePrefs({
    acceptRoutes: body.acceptRoutes,
    exitNode: body.exitNode,
    exitNodeAllowLanAccess: body.exitNodeAllowLanAccess,
    advertiseExitNode: body.advertiseExitNode,
  });
  res.json({ success: true, data: { status: 'applied' } });
}
