/**
 * OIDC RSA 密钥管理
 * 生成/加载/轮换 RSA 密钥对，存 /data/vibeos/secrets/oidc-keys.json（0700）
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { generateKeyPair, exportJWK, importJWK } from 'jose';
import { randomUUID } from 'node:crypto';
import { SECRETS_DIR } from '../../config.js';

const KEYS_FILE = path.join(SECRETS_DIR, 'oidc-keys.json');

/** jose 密钥类型（避免依赖 DOM CryptoKey） */
type JoseKey = Awaited<ReturnType<typeof importJWK>>;

/** 持久化密钥条目 */
interface StoredKey {
  kid: string;
  privateKeyJwk: Record<string, unknown>;
  publicKeyJwk: Record<string, unknown>;
  createdAt: string;
  /** 轮换后标记过期时间（7 天后不再用于签名，但 JWKS 仍返回） */
  retiredAt?: string;
}

interface KeysFile {
  keys: StoredKey[];
}

let cachedKeys: KeysFile | null = null;
let activePrivateKey: JoseKey | null = null;
let activeKid: string | null = null;

/** 确保密钥存在（首次启动自动生成 RSA 2048） */
export async function ensureKeys(): Promise<void> {
  await fs.mkdir(SECRETS_DIR, { recursive: true, mode: 0o700 });
  try {
    const raw = await fs.readFile(KEYS_FILE, 'utf-8');
    cachedKeys = JSON.parse(raw) as KeysFile;
  } catch {
    cachedKeys = { keys: [] };
  }

  // 如果没有活跃密钥，生成一个
  const hasActive = cachedKeys.keys.some((k) => !k.retiredAt);
  if (!hasActive) {
    await rotateKey();
  } else {
    // 加载活跃密钥
    const active = cachedKeys.keys.find((k) => !k.retiredAt);
    if (active) {
      activeKid = active.kid;
      activePrivateKey = await importJWK(active.privateKeyJwk, 'RS256');
    }
  }
}

/** 生成新密钥并轮换（旧密钥标记 retiredAt，保留 7 天） */
export async function rotateKey(): Promise<string> {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const kid = randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  const privJwk = await exportJWK(privateKey);
  const pubJwk = await exportJWK(publicKey);

  const privRecord: Record<string, unknown> = { ...privJwk, kid, use: 'sig', alg: 'RS256' };
  const pubRecord: Record<string, unknown> = { ...pubJwk, kid, use: 'sig', alg: 'RS256' };

  if (!cachedKeys) cachedKeys = { keys: [] };

  // 标记旧密钥为已退役
  for (const k of cachedKeys.keys) {
    if (!k.retiredAt) {
      k.retiredAt = now;
    }
  }

  cachedKeys.keys.push({
    kid,
    privateKeyJwk: privRecord,
    publicKeyJwk: pubRecord,
    createdAt: now,
  });

  // 清理超过 7 天的退役密钥
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  cachedKeys.keys = cachedKeys.keys.filter(
    (k) => !k.retiredAt || new Date(k.retiredAt).getTime() > sevenDaysAgo,
  );

  await fs.writeFile(KEYS_FILE, JSON.stringify(cachedKeys, null, 2), { mode: 0o600 });
  await fs.chmod(KEYS_FILE, 0o600);

  activeKid = kid;
  activePrivateKey = privateKey;
  return kid;
}

/** 获取当前活跃签名密钥 */
export function getSigningKey(): { key: JoseKey; kid: string } {
  if (!activePrivateKey || !activeKid) {
    throw new Error('OIDC keys not initialized — call ensureKeys() first');
  }
  return { key: activePrivateKey, kid: activeKid };
}

/** 获取 JWKS（所有公钥，含退役但未过期的） */
export function getJwks(): { keys: Array<Record<string, unknown>> } {
  if (!cachedKeys) return { keys: [] };
  return {
    keys: cachedKeys.keys.map((k) => ({
      ...k.publicKeyJwk,
      kty: 'RSA',
    })),
  };
}

/** 按 kid 获取公钥（用于验签） */
export async function getPublicKeyByKid(kid: string): Promise<JoseKey | null> {
  if (!cachedKeys) return null;
  const entry = cachedKeys.keys.find((k) => k.kid === kid);
  if (!entry) return null;
  return await importJWK(entry.publicKeyJwk, 'RS256');
}

/** 获取所有公钥（用于验签时不指定 kid） */
export async function getAllPublicKeys(): Promise<JoseKey[]> {
  if (!cachedKeys) return [];
  const keys: JoseKey[] = [];
  for (const entry of cachedKeys.keys) {
    keys.push(await importJWK(entry.publicKeyJwk, 'RS256'));
  }
  return keys;
}

/** 重置缓存（测试用） */
export function _resetCache(): void {
  cachedKeys = null;
  activePrivateKey = null;
  activeKid = null;
}
