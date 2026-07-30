/**
 * 模块：安全（IP 封禁） — 业务逻辑
 * 登录失败计数 → 自动封禁 → iptables 规则管理
 */
import { AppError } from '../../common/app-error.js';
import { executeCommandStrict } from '../../system/command-executor.js';
import * as dao from './security.dao.js';
import type {
  BannedEntry,
  RecordFailureResult,
  SecurityPolicy,
} from './security.types.js';

/* ---------- 白名单检查 ---------- */

/** 判断 IP 是否在白名单中 */
export function isWhitelisted(ip: string, whitelist: string[]): boolean {
  return whitelist.includes(ip);
}

/* ---------- iptables 操作 ---------- */

/** 通过 iptables 封禁 IP */
async function iptablesBan(ip: string): Promise<void> {
  await executeCommandStrict('iptables', ['-I', 'INPUT', '-s', ip, '-j', 'DROP']);
}

/** 通过 iptables 解封 IP */
async function iptablesUnban(ip: string): Promise<void> {
  await executeCommandStrict('iptables', ['-D', 'INPUT', '-s', ip, '-j', 'DROP']);
}

/* ---------- 封禁管理 ---------- */

/** 获取封禁列表（自动过滤已过期的条目） */
export async function getBannedList(): Promise<BannedEntry[]> {
  const entries = await dao.loadBanned();
  const now = Date.now();
  const active = entries.filter((e) => {
    if (e.expiresAt === null) return true;
    return new Date(e.expiresAt).getTime() > now;
  });
  // 如果有过期条目被过滤，持久化清理结果
  if (active.length !== entries.length) {
    await dao.saveBanned(active);
  }
  return active;
}

/**
 * 手动封禁 IP
 * @param ip - 目标 IP
 * @param reason - 封禁原因（可选）
 */
export async function banIp(ip: string, reason?: string): Promise<BannedEntry> {
  const policy = await dao.loadPolicy();

  if (isWhitelisted(ip, policy.whitelist)) {
    throw AppError.badRequest('WHITELISTED', `IP ${ip} 在白名单中，无法封禁`);
  }

  const entries = await dao.loadBanned();
  const existing = entries.find((e) => e.ip === ip);
  if (existing) {
    throw AppError.conflict(`IP ${ip} 已被封禁`);
  }

  // 执行 iptables 封禁
  await iptablesBan(ip);

  const entry: BannedEntry = {
    ip,
    reason: reason ?? '手动封禁',
    source: 'manual',
    bannedAt: new Date().toISOString(),
    expiresAt: null, // 手动封禁默认永久
  };

  entries.push(entry);
  await dao.saveBanned(entries);

  return entry;
}

/**
 * 解封 IP
 * @param ip - 目标 IP
 */
export async function unbanIp(ip: string): Promise<void> {
  const entries = await dao.loadBanned();
  const idx = entries.findIndex((e) => e.ip === ip);
  if (idx === -1) {
    throw AppError.notFound(`封禁记录 ${ip}`);
  }

  // 执行 iptables 解封
  await iptablesUnban(ip);

  entries.splice(idx, 1);
  await dao.saveBanned(entries);

  // 同时清除该 IP 的失败计数
  const failCounts = await dao.loadFailCounts();
  if (failCounts[ip]) {
    delete failCounts[ip];
    await dao.saveFailCounts(failCounts);
  }
}

/* ---------- 登录失败计数与自动封禁 ---------- */

/**
 * 记录一次登录失败
 * 达到阈值时自动封禁 IP
 * @param ip - 来源 IP
 */
export async function recordFailure(ip: string): Promise<RecordFailureResult> {
  const policy = await dao.loadPolicy();

  // 白名单豁免
  if (isWhitelisted(ip, policy.whitelist)) {
    return { count: 0, banned: false, whitelisted: true };
  }

  // 已封禁则直接返回
  const banned = await dao.loadBanned();
  if (banned.some((e) => e.ip === ip)) {
    return { count: 0, banned: true, whitelisted: false };
  }

  // 递增失败计数
  const failCounts = await dao.loadFailCounts();
  const entry = failCounts[ip] ?? { count: 0, lastAttempt: '' };
  entry.count += 1;
  entry.lastAttempt = new Date().toISOString();
  failCounts[ip] = entry;
  await dao.saveFailCounts(failCounts);

  // 检查是否达到阈值
  if (entry.count >= policy.maxAttempts) {
    // 自动封禁
    await iptablesBan(ip);

    const expiresAt = new Date(
      Date.now() + policy.banDurationHours * 60 * 60 * 1000,
    ).toISOString();

    const banEntry: BannedEntry = {
      ip,
      reason: `登录失败 ${entry.count} 次，自动封禁`,
      source: 'auto',
      bannedAt: new Date().toISOString(),
      expiresAt,
    };

    banned.push(banEntry);
    await dao.saveBanned(banned);

    // 清除失败计数
    delete failCounts[ip];
    await dao.saveFailCounts(failCounts);

    return { count: entry.count, banned: true, whitelisted: false };
  }

  return { count: entry.count, banned: false, whitelisted: false };
}

/* ---------- 策略管理 ---------- */

/** 获取封禁策略 */
export async function getPolicy(): Promise<SecurityPolicy> {
  return dao.loadPolicy();
}

/** 更新封禁策略（合并式） */
export async function updatePolicy(
  data: Partial<SecurityPolicy>,
): Promise<SecurityPolicy> {
  const policy = await dao.loadPolicy();

  if (typeof data.maxAttempts === 'number') policy.maxAttempts = data.maxAttempts;
  if (typeof data.banDurationHours === 'number') policy.banDurationHours = data.banDurationHours;
  if (Array.isArray(data.whitelist)) policy.whitelist = data.whitelist;

  await dao.savePolicy(policy);
  return policy;
}
