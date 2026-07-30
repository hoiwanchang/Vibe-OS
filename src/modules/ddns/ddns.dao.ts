/**
 * 模块：动态 DNS — 数据访问层
 * 配置持久化到 /data/vibeos/settings/ddns.json
 * 更新历史持久化到 /data/vibeos/settings/ddns-history.json
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import type { DdnsConfig, DdnsHistoryEntry } from './ddns.types.js';

const SETTINGS_DIR = join(VIBEOS_APP_DIR, 'settings');
const CONFIG_FILE = join(SETTINGS_DIR, 'ddns.json');
const HISTORY_FILE = join(SETTINGS_DIR, 'ddns-history.json');

/** 历史记录最大保留条数 */
const MAX_HISTORY = 200;

/** 默认配置 */
export function defaultConfig(): DdnsConfig {
  return {
    enabled: false,
    intervalMinutes: 30,
    ipCheckUrls: [
      'https://api.ipify.org',
      'https://ifconfig.me/ip',
      'https://icanhazip.com',
    ],
    records: [],
  };
}

/** 确保配置目录存在 */
async function ensureDir(): Promise<void> {
  await mkdir(SETTINGS_DIR, { recursive: true });
}

/** 读取 DDNS 配置（不存在则返回默认值） */
export async function loadConfig(): Promise<DdnsConfig> {
  await ensureDir();
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DdnsConfig>;
    const defaults = defaultConfig();
    return {
      enabled: parsed.enabled ?? defaults.enabled,
      intervalMinutes: parsed.intervalMinutes ?? defaults.intervalMinutes,
      ipCheckUrls: parsed.ipCheckUrls ?? defaults.ipCheckUrls,
      records: parsed.records ?? defaults.records,
    };
  } catch {
    return defaultConfig();
  }
}

/** 写入 DDNS 配置 */
export async function saveConfig(config: DdnsConfig): Promise<void> {
  await ensureDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/** 读取更新历史 */
export async function loadHistory(): Promise<DdnsHistoryEntry[]> {
  try {
    const raw = await readFile(HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DdnsHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 追加一条更新历史（自动截断到 MAX_HISTORY 条） */
export async function appendHistory(entry: DdnsHistoryEntry): Promise<void> {
  await ensureDir();
  const history = await loadHistory();
  history.push(entry);
  // 保留最近 MAX_HISTORY 条
  const trimmed = history.length > MAX_HISTORY
    ? history.slice(history.length - MAX_HISTORY)
    : history;
  await writeFile(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
}
