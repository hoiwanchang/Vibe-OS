/**
 * 模块：安全（IP 封禁） — 数据访问层
 * 封禁列表持久化到 /data/vibeos/security/banned.json
 * 失败计数持久化到 /data/vibeos/security/fail-counts.json
 * 封禁策略持久化到 /data/vibeos/security/policy.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import type {
  BannedEntry,
  FailCountMap,
  SecurityPolicy,
} from './security.types.js';

const SECURITY_DIR = join(VIBEOS_APP_DIR, 'security');
const BANNED_FILE = join(SECURITY_DIR, 'banned.json');
const FAIL_COUNTS_FILE = join(SECURITY_DIR, 'fail-counts.json');
const POLICY_FILE = join(SECURITY_DIR, 'policy.json');

/** 默认封禁策略 */
export function defaultPolicy(): SecurityPolicy {
  return {
    maxAttempts: 5,
    banDurationHours: 24,
    whitelist: [],
  };
}

/** 确保安全目录存在 */
async function ensureSecurityDir(): Promise<void> {
  await ensureDir(SECURITY_DIR);
}

/* ---------- 封禁列表 ---------- */

/** 读取封禁列表 */
export async function loadBanned(): Promise<BannedEntry[]> {
  try {
    const raw = await readFile(BANNED_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as BannedEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 写入封禁列表 */
export async function saveBanned(entries: BannedEntry[]): Promise<void> {
  await ensureSecurityDir();
  await writeFile(BANNED_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

/* ---------- 失败计数 ---------- */

/** 读取失败计数映射 */
export async function loadFailCounts(): Promise<FailCountMap> {
  try {
    const raw = await readFile(FAIL_COUNTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as FailCountMap;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** 写入失败计数映射 */
export async function saveFailCounts(map: FailCountMap): Promise<void> {
  await ensureSecurityDir();
  await writeFile(FAIL_COUNTS_FILE, JSON.stringify(map, null, 2), 'utf-8');
}

/* ---------- 封禁策略 ---------- */

/** 读取封禁策略（不存在则返回默认值） */
export async function loadPolicy(): Promise<SecurityPolicy> {
  try {
    const raw = await readFile(POLICY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SecurityPolicy>;
    const defaults = defaultPolicy();
    return {
      maxAttempts: parsed.maxAttempts ?? defaults.maxAttempts,
      banDurationHours: parsed.banDurationHours ?? defaults.banDurationHours,
      whitelist: parsed.whitelist ?? defaults.whitelist,
    };
  } catch {
    return defaultPolicy();
  }
}

/** 写入封禁策略 */
export async function savePolicy(policy: SecurityPolicy): Promise<void> {
  await ensureSecurityDir();
  await writeFile(POLICY_FILE, JSON.stringify(policy, null, 2), 'utf-8');
}
