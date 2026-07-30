/**
 * oidc 模块 — 持久化层
 * clients.json / codes/ / tokens/
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import type { AuthCode, OAuthClient, RefreshTokenRecord } from './oidc.types.js';

const OIDC_DIR = path.join(VIBEOS_APP_DIR, 'oidc');
const CLIENTS_FILE = path.join(OIDC_DIR, 'clients.json');
const CODES_DIR = path.join(OIDC_DIR, 'codes');
const TOKENS_DIR = path.join(OIDC_DIR, 'tokens');

/** 确保目录存在 */
export async function ensureOidcDirs(): Promise<void> {
  await fs.mkdir(CODES_DIR, { recursive: true });
  await fs.mkdir(TOKENS_DIR, { recursive: true });
}

// ===== 客户端 =====

/** 读取所有客户端 */
export async function loadClients(): Promise<OAuthClient[]> {
  try {
    const raw = await fs.readFile(CLIENTS_FILE, 'utf-8');
    return JSON.parse(raw) as OAuthClient[];
  } catch {
    return [];
  }
}

/** 写入所有客户端 */
export async function saveClients(clients: OAuthClient[]): Promise<void> {
  await fs.mkdir(OIDC_DIR, { recursive: true });
  await fs.writeFile(CLIENTS_FILE, JSON.stringify(clients, null, 2), 'utf-8');
}

/** 按 ID 查找客户端 */
export async function findClient(clientId: string): Promise<OAuthClient | null> {
  const clients = await loadClients();
  return clients.find((c) => c.id === clientId) ?? null;
}

// ===== 授权码 =====

/** 保存授权码 */
export async function saveAuthCode(authCode: AuthCode): Promise<void> {
  await fs.mkdir(CODES_DIR, { recursive: true });
  const file = path.join(CODES_DIR, `${authCode.code}.json`);
  await fs.writeFile(file, JSON.stringify(authCode), 'utf-8');
}

/** 读取授权码 */
export async function loadAuthCode(code: string): Promise<AuthCode | null> {
  try {
    const file = path.join(CODES_DIR, `${code}.json`);
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as AuthCode;
  } catch {
    return null;
  }
}

/** 标记授权码已使用 */
export async function markCodeUsed(code: string): Promise<void> {
  const record = await loadAuthCode(code);
  if (record) {
    record.used = true;
    await saveAuthCode(record);
  }
}

/** 删除授权码 */
export async function deleteAuthCode(code: string): Promise<void> {
  try {
    await fs.rm(path.join(CODES_DIR, `${code}.json`), { force: true });
  } catch { /* ignore */ }
}

// ===== 刷新令牌 =====

/** 保存刷新令牌 */
export async function saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
  await fs.mkdir(TOKENS_DIR, { recursive: true });
  const file = path.join(TOKENS_DIR, `${record.jti}.json`);
  await fs.writeFile(file, JSON.stringify(record), 'utf-8');
}

/** 按 token 值查找刷新令牌 */
export async function findRefreshToken(token: string): Promise<RefreshTokenRecord | null> {
  try {
    const files = await fs.readdir(TOKENS_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(TOKENS_DIR, f), 'utf-8');
        const record = JSON.parse(raw) as RefreshTokenRecord;
        if (record.token === token) return record;
      } catch { /* skip */ }
    }
  } catch { /* dir may not exist */ }
  return null;
}

/** 撤销刷新令牌 */
export async function revokeRefreshToken(jti: string): Promise<void> {
  try {
    const file = path.join(TOKENS_DIR, `${jti}.json`);
    const raw = await fs.readFile(file, 'utf-8');
    const record = JSON.parse(raw) as RefreshTokenRecord;
    record.revoked = true;
    await fs.writeFile(file, JSON.stringify(record), 'utf-8');
  } catch { /* ignore */ }
}

/** 清理过期授权码和令牌 */
export async function cleanExpired(): Promise<{ codes: number; tokens: number }> {
  const now = Date.now();
  let codes = 0;
  let tokens = 0;

  try {
    const codeFiles = await fs.readdir(CODES_DIR);
    for (const f of codeFiles) {
      if (!f.endsWith('.json')) continue;
      try {
        const filePath = path.join(CODES_DIR, f);
        const raw = await fs.readFile(filePath, 'utf-8');
        const record = JSON.parse(raw) as AuthCode;
        if (record.expiresAt < now || record.used) {
          await fs.rm(filePath, { force: true });
          codes++;
        }
      } catch { /* skip */ }
    }
  } catch { /* dir may not exist */ }

  try {
    const tokenFiles = await fs.readdir(TOKENS_DIR);
    for (const f of tokenFiles) {
      if (!f.endsWith('.json')) continue;
      try {
        const filePath = path.join(TOKENS_DIR, f);
        const raw = await fs.readFile(filePath, 'utf-8');
        const record = JSON.parse(raw) as RefreshTokenRecord;
        if (record.expiresAt < now || record.revoked) {
          await fs.rm(filePath, { force: true });
          tokens++;
        }
      } catch { /* skip */ }
    }
  } catch { /* dir may not exist */ }

  return { codes, tokens };
}
