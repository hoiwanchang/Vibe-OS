/**
 * 应用中心模块 — 业务逻辑层
 * 注册表查询、部署引擎、已安装应用管理、LLM 分析
 */
import { AppError } from '../../common/app-error.js';
import { ensureDir } from '../../system/filesystem.js';
import * as dao from './apps.dao.js';
import type {
  AnalyzeRepoRequest,
  AnalyzeRepoResult,
  DeployCustomRequest,
  DeployFromRegistryRequest,
  DeployResponse,
  InstalledApp,
  InstalledAppWithStatus,
  LlmConfig,
  RegistryApp,
} from './apps.types.js';

/* ---------- 注册表 ---------- */

/**
 * 将 unknown 值安全转为字符串（null/undefined 返回 fallback）
 * 规避 @typescript-eslint/no-base-to-string，避免对象被序列化为 [object Object]
 */
function toStr(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

/**
 * 获取注册表全部应用
 */
export async function getRegistry(): Promise<RegistryApp[]> {
  return dao.loadRegistry();
}

/**
 * 按分类筛选注册表应用
 */
export async function getRegistryByCategory(category: string): Promise<RegistryApp[]> {
  const apps = await dao.loadRegistry();
  return apps.filter((a) => a.category === category);
}

/**
 * 获取单个注册表应用
 */
export async function getRegistryApp(appId: string): Promise<RegistryApp> {
  const apps = await dao.loadRegistry();
  const app = apps.find((a) => a.id === appId);
  if (!app) {
    throw AppError.notFound(`注册表应用 [${appId}]`);
  }
  return app;
}

/* ---------- 部署引擎 ---------- */

/**
 * 替换卷挂载路径中的占位符
 * {uid} → 1000（默认用户）, {appname} → 应用 id
 */
function resolveVolumes(
  volumes: Array<{ host: string; container: string; readonly?: boolean }>,
  appId: string,
): Array<{ host: string; container: string; readonly?: boolean }> {
  return volumes.map((v) => ({
    ...v,
    host: v.host
      .replace(/\{uid\}/g, '1000')
      .replace(/\{appname\}/g, appId),
  }));
}

/**
 * 确保卷挂载的宿主机目录存在
 */
async function ensureVolumeDirs(
  volumes: Array<{ host: string }>,
): Promise<void> {
  for (const v of volumes) {
    await ensureDir(v.host);
  }
}

/**
 * 从注册表部署应用
 */
export async function deployFromRegistry(
  req: DeployFromRegistryRequest,
): Promise<DeployResponse> {
  const registryApp = await getRegistryApp(req.appId);

  // 检查是否已安装
  const installed = await dao.loadInstalled();
  if (installed.some((a) => a.appId === req.appId)) {
    throw AppError.conflict(`应用 [${req.appId}] 已安装，请先卸载再重新部署`);
  }

  const containerName = `vibeos-${req.appId}`;
  const ports = req.ports ?? registryApp.ports;
  const env = { ...registryApp.env, ...req.env };
  const volumes = resolveVolumes(req.volumes ?? registryApp.volumes, req.appId);

  // 确保数据目录存在
  await ensureVolumeDirs(volumes);

  // 生成 compose 并部署
  const yaml = dao.generateComposeYaml({
    name: containerName,
    image: registryApp.image,
    ports,
    volumes,
    env,
    memoryLimit: req.memoryLimit,
    cpuLimit: req.cpuLimit,
  });

  await dao.composeUp(containerName, yaml);

  // 记录已安装
  const app: InstalledApp = {
    appId: req.appId,
    containerName,
    image: registryApp.image,
    ports,
    volumes,
    env,
    installedAt: new Date().toISOString(),
    source: 'registry',
  };

  await dao.saveInstalled([...installed, app]);

  return {
    containerName,
    image: registryApp.image,
    status: 'deployed',
    app,
  };
}

/**
 * 自定义部署（LLM 分析确认后或直接手动配置）
 */
export async function deployCustom(req: DeployCustomRequest): Promise<DeployResponse> {
  // 校验名称
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(req.name)) {
    throw AppError.badRequest('INVALID_NAME', '应用名仅允许字母、数字、下划线、点和连字符');
  }

  const containerName = `vibeos-${req.name}`;

  // 检查是否已存在
  const installed = await dao.loadInstalled();
  if (installed.some((a) => a.containerName === containerName)) {
    throw AppError.conflict(`容器 [${containerName}] 已存在`);
  }

  const volumes = req.volumes ?? [];
  await ensureVolumeDirs(volumes);

  const yaml = dao.generateComposeYaml({
    name: containerName,
    image: req.image,
    ports: req.ports,
    volumes,
    env: req.env,
    memoryLimit: req.memoryLimit,
    cpuLimit: req.cpuLimit,
    restartPolicy: req.restartPolicy,
  });

  await dao.composeUp(containerName, yaml);

  const app: InstalledApp = {
    appId: req.name,
    containerName,
    image: req.image,
    ports: req.ports ?? [],
    volumes,
    env: req.env ?? {},
    installedAt: new Date().toISOString(),
    source: 'custom',
    gitUrl: req.gitUrl,
  };

  await dao.saveInstalled([...installed, app]);

  return {
    containerName,
    image: req.image,
    status: 'deployed',
    app,
  };
}

/* ---------- 已安装应用管理 ---------- */

/**
 * 获取已安装应用列表（含运行时状态）
 */
export async function getInstalledApps(): Promise<InstalledAppWithStatus[]> {
  const apps = await dao.loadInstalled();
  const result: InstalledAppWithStatus[] = [];

  for (const app of apps) {
    const state = await dao.getContainerState(app.containerName);
    let status: InstalledAppWithStatus['status'] = 'stopped';
    if (state === 'running') status = 'running';
    else if (state === 'exited' || state === 'dead') status = 'error';
    else if (state === 'not_found') status = 'stopped';

    result.push({ ...app, status, containerId: undefined });
  }

  return result;
}

/**
 * 卸载应用（停止并移除容器，保留数据目录）
 */
export async function uninstallApp(appId: string): Promise<void> {
  const installed = await dao.loadInstalled();
  const app = installed.find((a) => a.appId === appId);
  if (!app) {
    throw AppError.notFound(`已安装应用 [${appId}]`);
  }

  await dao.composeDown(app.containerName);
  await dao.saveInstalled(installed.filter((a) => a.appId !== appId));
}

/**
 * 重启已安装应用
 */
export async function restartApp(appId: string): Promise<void> {
  const installed = await dao.loadInstalled();
  const app = installed.find((a) => a.appId === appId);
  if (!app) {
    throw AppError.notFound(`已安装应用 [${appId}]`);
  }
  await dao.composeRestart(app.containerName);
}

/**
 * 停止已安装应用
 */
export async function stopApp(appId: string): Promise<void> {
  const installed = await dao.loadInstalled();
  const app = installed.find((a) => a.appId === appId);
  if (!app) {
    throw AppError.notFound(`已安装应用 [${appId}]`);
  }
  await dao.composeStop(app.containerName);
}

/* ---------- LLM 配置 ---------- */

/**
 * 获取 LLM 配置
 */
export async function getLlmConfig(): Promise<LlmConfig | null> {
  return dao.loadLlmConfig();
}

/**
 * 保存 LLM 配置
 */
export async function setLlmConfig(config: LlmConfig): Promise<void> {
  await dao.saveLlmConfig(config);
}

/* ---------- LLM 仓库分析 ---------- */

/**
 * 分析 Git 仓库并生成部署配置草稿
 * 流程：浅克隆 → 读取 Dockerfile/compose/README → 调用 LLM → 返回结构化配置
 */
export async function analyzeRepo(req: AnalyzeRepoRequest): Promise<AnalyzeRepoResult> {
  const llmConfig = await dao.loadLlmConfig();
  if (!llmConfig) {
    throw AppError.badRequest('LLM_NOT_CONFIGURED', '请先在系统设置中配置 LLM API');
  }

  // 浅克隆并读取关键文件
  const inspect = await dao.cloneAndInspect(req.gitUrl, req.branch);

  // 构建 LLM prompt
  const prompt = buildAnalyzePrompt(req.gitUrl, inspect);

  // 调用 LLM
  const llmResponse = await callLlm(llmConfig, prompt);

  // 解析 LLM 返回的 JSON
  return parseLlmResponse(llmResponse, inspect);
}

/**
 * 构建分析 prompt
 */
function buildAnalyzePrompt(
  gitUrl: string,
  inspect: { dockerfile: string | null; composeFile: string | null; readme: string | null; files: string[] },
): string {
  const parts: string[] = [
    '你是一个 Docker 部署专家。分析以下 Git 仓库的内容，生成一个适合 NAS 部署的 docker-compose 配置。',
    '',
    `仓库地址: ${gitUrl}`,
    `顶层文件: ${inspect.files.join(', ')}`,
  ];

  if (inspect.dockerfile) {
    parts.push('', '--- Dockerfile ---', inspect.dockerfile.slice(0, 3000));
  }
  if (inspect.composeFile) {
    parts.push('', '--- docker-compose.yml ---', inspect.composeFile.slice(0, 3000));
  }
  if (inspect.readme) {
    parts.push('', '--- README (前 2000 字) ---', inspect.readme.slice(0, 2000));
  }

  parts.push(
    '',
    '请以 JSON 格式返回以下结构（不要包含 markdown 代码块标记）：',
    '{',
    '  "name": "应用名（kebab-case）",',
    '  "image": "Docker 镜像（含 tag，优先使用官方镜像）",',
    '  "ports": [{"host": 8080, "container": 80}],',
    '  "volumes": [{"host": "/data/vibeos/apps/{name}/data", "container": "/data"}],',
    '  "env": {"KEY": "value"},',
    '  "healthcheck": "http://localhost:PORT/health 或 null",',
    '  "analysis": "简要分析说明（中文）",',
    '  "confidence": 0.8',
    '}',
    '',
    '规则：',
    '- 数据卷必须映射到 /data/vibeos/apps/{name}/ 下',
    '- 端口选择常用默认端口，避开 3000/5173/8080',
    '- 环境变量给出合理默认值',
    '- 如果仓库没有 Dockerfile，推断最合适的官方镜像',
    '- confidence 表示你对配置正确性的信心（0-1）',
  );

  return parts.join('\n');
}

/**
 * 调用 OpenAI 兼容 LLM API
 */
async function callLlm(config: LlmConfig, prompt: string): Promise<string> {
  const body = {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: config.maxTokens ?? 2048,
    temperature: config.temperature ?? 0.3,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw AppError.commandFailed('LLM API', `HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 解析 LLM 返回的 JSON 配置
 */
function parseLlmResponse(
  raw: string,
  inspect: { dockerfile: string | null; composeFile: string | null },
): AnalyzeRepoResult {
  // 尝试提取 JSON（LLM 可能包裹在 markdown 代码块中）
  let jsonStr = raw.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[1]) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return {
      name: toStr(parsed['name'], 'custom-app'),
      image: toStr(parsed['image']),
      ports: Array.isArray(parsed['ports'])
        ? (parsed['ports'] as Array<{ host: number; container: number }>)
        : [],
      volumes: Array.isArray(parsed['volumes'])
        ? (parsed['volumes'] as Array<{ host: string; container: string; readonly?: boolean }>)
        : [],
      env: (parsed['env'] as Record<string, string>) ?? {},
      healthcheck: parsed['healthcheck'] ? toStr(parsed['healthcheck']) : undefined,
      analysis: toStr(parsed['analysis']),
      confidence: Number(parsed['confidence'] ?? 0.5),
      dockerfile: inspect.dockerfile ?? undefined,
      composeFile: inspect.composeFile ?? undefined,
    };
  } catch {
    throw AppError.internal('LLM 返回内容无法解析为有效 JSON，请重试');
  }
}
