/**
 * 应用中心模块 — 数据访问层
 * 注册表读取、已安装应用持久化、Docker Compose 生成与执行
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir, pathExists } from '../../system/filesystem.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import type {
  InstalledApp,
  InstalledAppsFile,
  RegistryApp,
  RegistryFile,
} from './apps.types.js';

/** 注册表文件路径 */
const REGISTRY_FILE = path.join(VIBEOS_APP_DIR, 'apps', 'registry.json');

/** 已安装应用持久化路径 */
const INSTALLED_FILE = path.join(VIBEOS_APP_DIR, 'apps', 'installed.json');

/** Docker Compose 项目目录 */
const COMPOSE_DIR = path.join(VIBEOS_APP_DIR, 'apps', 'compose');

/* ---------- 注册表 ---------- */

/**
 * 读取应用注册表
 * 文件不存在时从内置种子文件复制
 */
export async function loadRegistry(): Promise<RegistryApp[]> {
  if (!(await pathExists(REGISTRY_FILE))) {
    await seedRegistry();
  }
  try {
    const raw = await fs.readFile(REGISTRY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as RegistryFile;
    return Array.isArray(parsed.apps) ? parsed.apps : [];
  } catch {
    return [];
  }
}

/**
 * 从项目内置种子文件初始化注册表
 */
async function seedRegistry(): Promise<void> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  // 种子文件与 DAO 同目录
  const seedPath = path.join(currentDir, 'registry.seed.json');
  try {
    const raw = await fs.readFile(seedPath, 'utf-8');
    JSON.parse(raw); // 校验 JSON 合法性
    await ensureDir(path.dirname(REGISTRY_FILE));
    await fs.copyFile(seedPath, REGISTRY_FILE);
  } catch {
    // 种子文件不存在或非法时静默跳过，返回空注册表
  }
}

/**
 * 保存应用注册表（覆盖写入）
 */
export async function saveRegistry(apps: RegistryApp[]): Promise<void> {
  await ensureDir(path.dirname(REGISTRY_FILE));
  const data: RegistryFile = { version: 1, apps };
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/* ---------- 已安装应用 ---------- */

/**
 * 读取已安装应用列表
 */
export async function loadInstalled(): Promise<InstalledApp[]> {
  try {
    const raw = await fs.readFile(INSTALLED_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as InstalledAppsFile;
    return Array.isArray(parsed.apps) ? parsed.apps : [];
  } catch {
    return [];
  }
}

/**
 * 保存已安装应用列表（覆盖写入）
 */
export async function saveInstalled(apps: InstalledApp[]): Promise<void> {
  await ensureDir(path.dirname(INSTALLED_FILE));
  const data: InstalledAppsFile = { apps };
  await fs.writeFile(INSTALLED_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/* ---------- Docker Compose 引擎 ---------- */

/**
 * 生成 docker-compose.yml 内容
 * @param name - 项目名（容器名前缀）
 * @param image - Docker 镜像
 * @param ports - 端口映射
 * @param volumes - 卷挂载
 * @param env - 环境变量
 * @param memoryLimit - 内存限制
 * @param cpuLimit - CPU 限制
 * @param restartPolicy - 重启策略
 * @returns YAML 字符串
 */
export function generateComposeYaml(opts: {
  name: string;
  image: string;
  ports?: Array<{ host: number; container: number; protocol?: string }>;
  volumes?: Array<{ host: string; container: string; readonly?: boolean }>;
  env?: Record<string, string>;
  memoryLimit?: string;
  cpuLimit?: number;
  restartPolicy?: string;
}): string {
  const lines: string[] = [];
  lines.push('services:');
  lines.push(`  ${opts.name}:`);
  lines.push(`    image: ${opts.image}`);
  lines.push(`    container_name: ${opts.name}`);
  lines.push(`    restart: ${opts.restartPolicy ?? 'unless-stopped'}`);

  if (opts.ports && opts.ports.length > 0) {
    lines.push('    ports:');
    for (const p of opts.ports) {
      const proto = p.protocol && p.protocol !== 'tcp' ? `/${p.protocol}` : '';
      lines.push(`      - "${p.host}:${p.container}${proto}"`);
    }
  }

  if (opts.volumes && opts.volumes.length > 0) {
    lines.push('    volumes:');
    for (const v of opts.volumes) {
      lines.push(`      - ${v.host}:${v.container}${v.readonly ? ':ro' : ''}`);
    }
  }

  if (opts.env && Object.keys(opts.env).length > 0) {
    lines.push('    environment:');
    for (const [k, v] of Object.entries(opts.env)) {
      lines.push(`      - ${k}=${v}`);
    }
  }

  if (opts.memoryLimit || opts.cpuLimit) {
    lines.push('    deploy:');
    lines.push('      resources:');
    lines.push('        limits:');
    if (opts.memoryLimit) {
      lines.push(`          memory: ${opts.memoryLimit}`);
    }
    if (opts.cpuLimit) {
      lines.push(`          cpus: "${opts.cpuLimit}"`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * 写入 compose 文件并执行 docker compose up -d
 * @param name - 项目名
 * @param yaml - compose YAML 内容
 * @returns 容器 ID
 */
export async function composeUp(name: string, yaml: string): Promise<string> {
  const projectDir = path.join(COMPOSE_DIR, name);
  await ensureDir(projectDir);

  const composePath = path.join(projectDir, 'docker-compose.yml');
  await fs.writeFile(composePath, yaml, 'utf-8');

  await executeCommandStrict('docker', [
    'compose', '-f', composePath, '-p', name, 'up', '-d',
  ]);

  // 获取容器 ID
  const result = await executeCommand('docker', [
    'compose', '-f', composePath, '-p', name, 'ps', '-q',
  ]);
  return result.stdout.trim().split('\n')[0] ?? '';
}

/**
 * 停止并移除 compose 项目
 */
export async function composeDown(name: string): Promise<void> {
  const composePath = path.join(COMPOSE_DIR, name, 'docker-compose.yml');
  if (!(await pathExists(composePath))) {
    // 回退到直接删除容器
    await executeCommand('docker', ['rm', '-f', name]);
    return;
  }
  await executeCommandStrict('docker', [
    'compose', '-f', composePath, '-p', name, 'down',
  ]);
}

/**
 * 重启 compose 项目
 */
export async function composeRestart(name: string): Promise<void> {
  const composePath = path.join(COMPOSE_DIR, name, 'docker-compose.yml');
  if (!(await pathExists(composePath))) {
    await executeCommandStrict('docker', ['restart', name]);
    return;
  }
  await executeCommandStrict('docker', [
    'compose', '-f', composePath, '-p', name, 'restart',
  ]);
}

/**
 * 停止 compose 项目（不移除）
 */
export async function composeStop(name: string): Promise<void> {
  const composePath = path.join(COMPOSE_DIR, name, 'docker-compose.yml');
  if (!(await pathExists(composePath))) {
    await executeCommandStrict('docker', ['stop', name]);
    return;
  }
  await executeCommandStrict('docker', [
    'compose', '-f', composePath, '-p', name, 'stop',
  ]);
}

/**
 * 获取容器运行状态
 */
export async function getContainerState(name: string): Promise<string> {
  const result = await executeCommand('docker', [
    'inspect', '--format', '{{.State.Status}}', name,
  ]);
  if (result.exitCode !== 0) return 'not_found';
  return result.stdout.trim();
}

/**
 * 健康检查（HTTP GET）
 */
export async function checkHealth(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/* ---------- LLM 配置持久化 ---------- */

/** LLM 配置文件路径 */
const LLM_CONFIG_FILE = path.join(VIBEOS_APP_DIR, 'apps', 'llm-config.json');

/**
 * 读取 LLM 配置
 */
export async function loadLlmConfig(): Promise<{
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
} | null> {
  try {
    const raw = await fs.readFile(LLM_CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as {
      endpoint: string;
      apiKey: string;
      model: string;
      maxTokens?: number;
      temperature?: number;
    };
  } catch {
    return null;
  }
}

/**
 * 保存 LLM 配置
 */
export async function saveLlmConfig(config: {
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<void> {
  await ensureDir(path.dirname(LLM_CONFIG_FILE));
  await fs.writeFile(LLM_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/* ---------- Git 仓库分析辅助 ---------- */

/**
 * 浅克隆仓库并读取关键文件
 * @returns Dockerfile / docker-compose.yml / README 内容
 */
export async function cloneAndInspect(gitUrl: string, branch?: string): Promise<{
  dockerfile: string | null;
  composeFile: string | null;
  readme: string | null;
  files: string[];
}> {
  const tmpDir = path.join(VIBEOS_APP_DIR, 'cache', `analyze-${Date.now()}`);
  await ensureDir(tmpDir);

  const args = ['clone', '--depth', '1'];
  if (branch) args.push('--branch', branch);
  args.push(gitUrl, tmpDir);

  const cloneResult = await executeCommand('git', args, 60000);
  if (cloneResult.exitCode !== 0) {
    throw new Error(`git clone 失败: ${cloneResult.stderr}`);
  }

  // 读取关键文件
  const readFile = async (name: string): Promise<string | null> => {
    const filePath = path.join(tmpDir, name);
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return null;
    }
  };

  const [dockerfile, composeFile, readme] = await Promise.all([
    readFile('Dockerfile'),
    readFile('docker-compose.yml').then((r) => r ?? readFile('docker-compose.yaml')),
    readFile('README.md').then((r) => r ?? readFile('README.rst')),
  ]);

  // 列出顶层文件
  const entries = await fs.readdir(tmpDir);

  // 清理临时目录
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  return { dockerfile, composeFile, readme, files: entries };
}
