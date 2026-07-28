/**
 * 应用中心模块 — 控制器层
 * 处理 HTTP 请求/响应，调用 service 层
 */
import type { Request, Response } from 'express';
import * as service from './apps.service.js';
import type {
  AnalyzeRepoRequest,
  DeployCustomRequest,
  DeployFromRegistryRequest,
  LlmConfig,
} from './apps.types.js';

/* ---------- 注册表 ---------- */

/** GET /api/apps/registry — 注册表列表 */
export async function handleRegistry(_req: Request, res: Response): Promise<void> {
  const apps = await service.getRegistry();
  res.json({ apps });
}

/** GET /api/apps/registry/:id — 单个注册表应用 */
export async function handleRegistryDetail(req: Request, res: Response): Promise<void> {
  const app = await service.getRegistryApp(req.params['id'] as string);
  res.json({ app });
}

/* ---------- 部署 ---------- */

/** POST /api/apps/deploy — 从注册表部署 */
export async function handleDeployRegistry(req: Request, res: Response): Promise<void> {
  const result = await service.deployFromRegistry(req.body as DeployFromRegistryRequest);
  res.status(201).json(result);
}

/** POST /api/apps/deploy-custom — 自定义部署 */
export async function handleDeployCustom(req: Request, res: Response): Promise<void> {
  const result = await service.deployCustom(req.body as DeployCustomRequest);
  res.status(201).json(result);
}

/* ---------- 已安装应用 ---------- */

/** GET /api/apps/installed — 已安装应用列表 */
export async function handleInstalled(_req: Request, res: Response): Promise<void> {
  const apps = await service.getInstalledApps();
  res.json({ apps });
}

/** DELETE /api/apps/installed/:id — 卸载应用 */
export async function handleUninstall(req: Request, res: Response): Promise<void> {
  await service.uninstallApp(req.params['id'] as string);
  res.json({ removed: req.params['id'] });
}

/** POST /api/apps/installed/:id/restart — 重启应用 */
export async function handleRestart(req: Request, res: Response): Promise<void> {
  await service.restartApp(req.params['id'] as string);
  res.json({ restarted: req.params['id'] });
}

/** POST /api/apps/installed/:id/stop — 停止应用 */
export async function handleStop(req: Request, res: Response): Promise<void> {
  await service.stopApp(req.params['id'] as string);
  res.json({ stopped: req.params['id'] });
}

/* ---------- LLM 配置 ---------- */

/** GET /api/apps/llm-config — 获取 LLM 配置 */
export async function handleGetLlmConfig(_req: Request, res: Response): Promise<void> {
  const config = await service.getLlmConfig();
  // 不返回完整 apiKey，仅返回掩码
  if (config) {
    const masked: LlmConfig = {
      ...config,
      apiKey: config.apiKey.length > 8
        ? `${config.apiKey.slice(0, 4)}****${config.apiKey.slice(-4)}`
        : '****',
    };
    res.json({ config: masked, configured: true });
  } else {
    res.json({ config: null, configured: false });
  }
}

/** PUT /api/apps/llm-config — 保存 LLM 配置 */
export async function handleSetLlmConfig(req: Request, res: Response): Promise<void> {
  await service.setLlmConfig(req.body as LlmConfig);
  res.json({ updated: true });
}

/* ---------- LLM 仓库分析 ---------- */

/** POST /api/apps/analyze — 分析 Git 仓库 */
export async function handleAnalyze(req: Request, res: Response): Promise<void> {
  const result = await service.analyzeRepo(req.body as AnalyzeRepoRequest);
  res.json(result);
}
