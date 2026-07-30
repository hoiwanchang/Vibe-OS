/**
 * 模块：反向代理管理 — 数据访问层
 * 规则持久化到 JSON 文件：VIBEOS_APP_DIR/settings/proxy.json
 * nginx 配置文件生成到：VIBEOS_APP_DIR/proxy/vhosts/
 */
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import type { ProxyRule } from './proxy.types.js';

/** 规则持久化文件路径 */
const RULES_FILE = join(VIBEOS_APP_DIR, 'settings', 'proxy.json');

/** nginx vhost 配置输出目录 */
export const NGINX_VHOST_DIR = join(VIBEOS_APP_DIR, 'proxy', 'vhosts');

/** nginx 访问日志目录 */
export const NGINX_LOG_DIR = join(VIBEOS_APP_DIR, 'proxy', 'logs');

/** 证书默认路径 */
export const CERT_PATH = join(VIBEOS_APP_DIR, 'proxy', 'certs', 'proxy.crt');
export const KEY_PATH = join(VIBEOS_APP_DIR, 'proxy', 'certs', 'proxy.key');

/** 规则存储结构 */
interface RulesStore {
  rules: ProxyRule[];
  lastReload: string | null;
}

/** 确保目录存在 */
async function ensureDirs(): Promise<void> {
  await mkdir(dirname(RULES_FILE), { recursive: true });
  await mkdir(NGINX_VHOST_DIR, { recursive: true });
  await mkdir(NGINX_LOG_DIR, { recursive: true });
}

/** 读取全部规则（不存在则返回空） */
export async function loadRules(): Promise<ProxyRule[]> {
  try {
    const raw = await readFile(RULES_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as RulesStore;
    return Array.isArray(parsed.rules) ? parsed.rules : [];
  } catch {
    return [];
  }
}

/** 写入全部规则（覆盖） */
export async function saveRules(rules: ProxyRule[]): Promise<void> {
  await ensureDirs();
  const store: RulesStore = { rules, lastReload: null };
  await writeFile(RULES_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/** 读取最近重载时间 */
export async function loadLastReload(): Promise<string | null> {
  try {
    const raw = await readFile(RULES_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as RulesStore;
    return parsed.lastReload ?? null;
  } catch {
    return null;
  }
}

/** 更新最近重载时间 */
export async function saveLastReload(timestamp: string): Promise<void> {
  await ensureDirs();
  let rules: ProxyRule[] = [];
  try {
    const raw = await readFile(RULES_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as RulesStore;
    rules = Array.isArray(parsed.rules) ? parsed.rules : [];
  } catch {
    /* 首次写入 */
  }
  const store: RulesStore = { rules, lastReload: timestamp };
  await writeFile(RULES_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/** 写入单个 vhost 配置文件 */
export async function writeVhostConfig(
  filename: string,
  content: string,
): Promise<string> {
  await ensureDirs();
  const filePath = join(NGINX_VHOST_DIR, filename);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/** 删除单个 vhost 配置文件 */
export async function removeVhostConfig(filename: string): Promise<void> {
  try {
    await rm(join(NGINX_VHOST_DIR, filename), { force: true });
  } catch {
    /* 忽略不存在 */
  }
}

/** 列出所有 vhost 配置文件名 */
export async function listVhostFiles(): Promise<string[]> {
  try {
    const files = await readdir(NGINX_VHOST_DIR);
    return files.filter((f) => f.endsWith('.conf'));
  } catch {
    return [];
  }
}

/** 清空所有 vhost 配置文件 */
export async function clearVhostConfigs(): Promise<void> {
  try {
    const files = await readdir(NGINX_VHOST_DIR);
    await Promise.all(
      files
        .filter((f) => f.endsWith('.conf'))
        .map((f) => rm(join(NGINX_VHOST_DIR, f), { force: true })),
    );
  } catch {
    /* 目录不存在则忽略 */
  }
}
