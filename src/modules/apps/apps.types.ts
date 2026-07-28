/**
 * 应用中心模块 — 类型定义
 * 应用注册表、已安装应用、部署引擎、LLM 分析
 */

/* ---------- 应用注册表 ---------- */

/** 端口映射条目 */
export interface AppPortMapping {
  /** 宿主机端口 */
  host: number;
  /** 容器内端口 */
  container: number;
  /** 协议（默认 tcp） */
  protocol?: 'tcp' | 'udp';
}

/** 卷挂载条目 */
export interface AppVolumeMapping {
  /** 宿主机路径（支持 {uid}、{appname} 占位符） */
  host: string;
  /** 容器内路径 */
  container: string;
  /** 是否只读 */
  readonly?: boolean;
}

/** 注册表应用条目 */
export interface RegistryApp {
  /** 唯一标识（kebab-case） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 分类 */
  category: 'media' | 'files' | 'security' | 'tools' | 'monitoring' | 'network' | 'ai' | 'other';
  /** 简介 */
  description: string;
  /** 图标 URL 或 emoji */
  icon: string;
  /** Docker 镜像（含 tag） */
  image: string;
  /** 端口映射 */
  ports: AppPortMapping[];
  /** 卷挂载 */
  volumes: AppVolumeMapping[];
  /** 环境变量 */
  env: Record<string, string>;
  /** 健康检查 URL（可选） */
  healthcheck?: string;
  /** 项目主页 */
  homepage?: string;
  /** 依赖的其他应用 id（如数据库） */
  dependsOn?: string[];
  /** 部署后提示 */
  postInstallNote?: string;
}

/** 注册表文件结构 */
export interface RegistryFile {
  version: number;
  apps: RegistryApp[];
}

/* ---------- 已安装应用 ---------- */

/** 已安装应用状态 */
export type InstalledAppStatus = 'running' | 'stopped' | 'error' | 'deploying';

/** 已安装应用记录 */
export interface InstalledApp {
  /** 注册表应用 id */
  appId: string;
  /** 容器名（部署时确定） */
  containerName: string;
  /** 实际使用的镜像 */
  image: string;
  /** 端口映射（实际值） */
  ports: AppPortMapping[];
  /** 卷挂载（实际值，占位符已替换） */
  volumes: AppVolumeMapping[];
  /** 环境变量（实际值） */
  env: Record<string, string>;
  /** 安装时间 */
  installedAt: string;
  /** 来源：registry（注册表）或 custom（自定义/LLM 分析） */
  source: 'registry' | 'custom';
  /** 自定义应用的 git 仓库 URL（source=custom 时） */
  gitUrl?: string;
}

/** 已安装应用 + 运行时状态 */
export interface InstalledAppWithStatus extends InstalledApp {
  /** 运行时状态 */
  status: InstalledAppStatus;
  /** 容器 ID（运行时） */
  containerId?: string;
}

/** 已安装应用持久化文件 */
export interface InstalledAppsFile {
  apps: InstalledApp[];
}

/* ---------- 部署请求/响应 ---------- */

/** 从注册表部署请求 */
export interface DeployFromRegistryRequest {
  /** 注册表应用 id */
  appId: string;
  /** 自定义端口映射（覆盖默认） */
  ports?: AppPortMapping[];
  /** 自定义环境变量（合并覆盖默认） */
  env?: Record<string, string>;
  /** 自定义卷挂载（覆盖默认） */
  volumes?: AppVolumeMapping[];
  /** 内存限制 */
  memoryLimit?: string;
  /** CPU 限制 */
  cpuLimit?: number;
}

/** 自定义部署请求（LLM 分析结果确认后） */
export interface DeployCustomRequest {
  /** 应用名称 */
  name: string;
  /** Docker 镜像 */
  image: string;
  /** 端口映射 */
  ports?: AppPortMapping[];
  /** 卷挂载 */
  volumes?: AppVolumeMapping[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 内存限制 */
  memoryLimit?: string;
  /** CPU 限制 */
  cpuLimit?: number;
  /** 重启策略 */
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  /** 来源 git 仓库 URL */
  gitUrl?: string;
}

/** 部署响应 */
export interface DeployResponse {
  /** 容器名 */
  containerName: string;
  /** 镜像 */
  image: string;
  /** 状态 */
  status: string;
  /** 已安装应用记录 */
  app: InstalledApp;
}

/* ---------- LLM 分析 ---------- */

/** LLM API 配置 */
export interface LlmConfig {
  /** API 端点（OpenAI 兼容） */
  endpoint: string;
  /** API 密钥 */
  apiKey: string;
  /** 模型名 */
  model: string;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 温度 */
  temperature?: number;
}

/** Git 仓库分析请求 */
export interface AnalyzeRepoRequest {
  /** Git 仓库 URL */
  gitUrl: string;
  /** 分支（默认 main） */
  branch?: string;
}

/** LLM 分析结果（配置草稿） */
export interface AnalyzeRepoResult {
  /** 推断的应用名称 */
  name: string;
  /** 推断的 Docker 镜像 */
  image: string;
  /** 推断的端口映射 */
  ports: AppPortMapping[];
  /** 推断的卷挂载 */
  volumes: AppVolumeMapping[];
  /** 推断的环境变量 */
  env: Record<string, string>;
  /** 推断的健康检查 URL */
  healthcheck?: string;
  /** LLM 分析说明 */
  analysis: string;
  /** 置信度（0-1） */
  confidence: number;
  /** 原始 Dockerfile 内容（如有） */
  dockerfile?: string;
  /** 原始 docker-compose.yml 内容（如有） */
  composeFile?: string;
}
