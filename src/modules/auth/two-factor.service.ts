/**
 * 2FA / TOTP 服务层
 * 用户 2FA 配置存储在 /data/vibeos/auth/2fa/{uid}.json
 * 全局强制 2FA 配置存储在 /data/vibeos/auth/2fa/global.json
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { VIBEOS_APP_DIR, FORCE_2FA } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { ensureDir } from '../../system/filesystem.js';
import * as dao from './auth.dao.js';
import type {
  BackupCodeRecord,
  LoginResponse,
  Pending2FAToken,
  Session,
  TwoFactorConfig,
  TwoFactorSetupResponse,
} from './auth.types.js';

const TWO_FA_DIR = path.join(VIBEOS_APP_DIR, 'auth', '2fa');
const GLOBAL_CONFIG_FILE = path.join(TWO_FA_DIR, 'global.json');
const BCRYPT_COST = 10;
const BACKUP_CODE_COUNT = 10;
const PENDING_2FA_TTL_MS = 5 * 60 * 1000; // 5 分钟

/** 内存中的待完成 2FA 令牌 */
const pending2FATokens = new Map<string, Pending2FAToken>();

/** TOTP 配置参数 */
const TOTP_OPTIONS = {
  issuer: 'VibeOS',
  algorithm: 'SHA1',
  digits: 6 as const,
  period: 30,
};

// ===== 全局配置 =====

interface GlobalTwoFactorConfig {
  force2fa: boolean;
}

/** 读取全局 2FA 配置 */
export async function getGlobalConfig(): Promise<GlobalTwoFactorConfig> {
  try {
    const raw = await fs.readFile(GLOBAL_CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as GlobalTwoFactorConfig;
  } catch {
    return { force2fa: FORCE_2FA };
  }
}

/** 设置全局 force2fa */
export async function setForce2FA(force: boolean): Promise<void> {
  await ensureDir(TWO_FA_DIR);
  const config: GlobalTwoFactorConfig = { force2fa: force };
  await fs.writeFile(GLOBAL_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/** 判断用户是否需要 2FA（已启用或全局强制） */
export async function is2FARequired(uid: number): Promise<boolean> {
  const config = await loadConfig(uid);
  if (config?.enabled) return true;
  const global = await getGlobalConfig();
  return global.force2fa;
}

// ===== 用户 2FA 配置持久化 =====

/** 配置文件路径 */
function configPath(uid: number): string {
  return path.join(TWO_FA_DIR, `${uid}.json`);
}

/** 加载用户 2FA 配置 */
export async function loadConfig(uid: number): Promise<TwoFactorConfig | null> {
  try {
    const raw = await fs.readFile(configPath(uid), 'utf-8');
    return JSON.parse(raw) as TwoFactorConfig;
  } catch {
    return null;
  }
}

/** 保存用户 2FA 配置 */
async function saveConfig(config: TwoFactorConfig): Promise<void> {
  await ensureDir(TWO_FA_DIR);
  config.updatedAt = new Date().toISOString();
  await fs.writeFile(configPath(config.uid), JSON.stringify(config, null, 2), 'utf-8');
}

/** 删除用户 2FA 配置 */
export async function deleteConfig(uid: number): Promise<void> {
  try {
    await fs.rm(configPath(uid), { force: true });
  } catch { /* ignore */ }
}

// ===== 核心功能 =====

/**
 * 生成 TOTP secret + otpauth:// URI + 二维码 data URI
 * 存入用户配置（enabled=false，等待 verify 确认）
 */
export async function setup(uid: number, username: string): Promise<TwoFactorSetupResponse> {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    ...TOTP_OPTIONS,
    label: username,
    secret,
  });

  const uri = totp.toString();
  const qrDataUri = await QRCode.toDataURL(uri, { width: 256, margin: 2 });

  // 保存配置（未启用状态）
  const existing = await loadConfig(uid);
  const config: TwoFactorConfig = {
    uid,
    secret: secret.base32,
    enabled: existing?.enabled ?? false,
    backupCodes: existing?.backupCodes ?? [],
    plainBackupCodes: existing?.plainBackupCodes,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveConfig(config);

  return {
    secret: secret.base32,
    uri,
    qrDataUri,
  };
}

/**
 * 验证 TOTP 码，成功后启用 2FA 并生成备用码
 */
export async function verify(uid: number, code: string): Promise<{ backupCodes: string[] }> {
  const config = await loadConfig(uid);
  if (!config) {
    throw AppError.badRequest('TWO_FA_NOT_SETUP', '请先执行 2FA setup');
  }

  const valid = validateTOTP(config.secret, code);
  if (!valid) {
    throw AppError.unauthorized('验证码错误或已过期');
  }

  // 生成备用码
  const plainCodes = generateBackupCodes();
  const hashedCodes: BackupCodeRecord[] = [];
  for (const plain of plainCodes) {
    const hash = await bcrypt.hash(plain, BCRYPT_COST);
    hashedCodes.push({ hash, used: false });
  }

  config.enabled = true;
  config.backupCodes = hashedCodes;
  config.plainBackupCodes = plainCodes;
  await saveConfig(config);

  return { backupCodes: plainCodes };
}

/**
 * 关闭 2FA（需密码确认）
 */
export async function disable(uid: number, password: string): Promise<void> {
  const user = await dao.findUserByUid(uid);
  if (!user) throw AppError.notFound('用户');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw AppError.badRequest('WRONG_PASSWORD', '密码错误');
  }

  await deleteConfig(uid);
}

/**
 * 查看备用码（仅启用后第一次可见明文）
 */
export async function getBackupCodes(uid: number): Promise<{ codes: string[] | null }> {
  const config = await loadConfig(uid);
  if (!config?.enabled) {
    throw AppError.badRequest('TWO_FA_NOT_ENABLED', '2FA 未启用');
  }

  if (config.plainBackupCodes && config.plainBackupCodes.length > 0) {
    const codes = [...config.plainBackupCodes];
    // 查看后清空明文
    config.plainBackupCodes = [];
    await saveConfig(config);
    return { codes };
  }

  return { codes: null };
}

/**
 * 重新生成备用码（需验证 TOTP 码）
 */
export async function regenerateBackupCodes(
  uid: number,
  code: string,
): Promise<{ backupCodes: string[] }> {
  const config = await loadConfig(uid);
  if (!config?.enabled) {
    throw AppError.badRequest('TWO_FA_NOT_ENABLED', '2FA 未启用');
  }

  const valid = validateTOTP(config.secret, code);
  if (!valid) {
    throw AppError.unauthorized('验证码错误或已过期');
  }

  const plainCodes = generateBackupCodes();
  const hashedCodes: BackupCodeRecord[] = [];
  for (const plain of plainCodes) {
    const hash = await bcrypt.hash(plain, BCRYPT_COST);
    hashedCodes.push({ hash, used: false });
  }

  config.backupCodes = hashedCodes;
  config.plainBackupCodes = plainCodes;
  await saveConfig(config);

  return { backupCodes: plainCodes };
}

// ===== 登录流程 =====

/**
 * 创建待完成 2FA 的临时令牌
 */
export function createPending2FAToken(uid: number, username: string, ip: string): string {
  const token = `pending-2fa-${randomUUID()}`;
  const now = Date.now();
  pending2FATokens.set(token, {
    uid,
    username,
    ip,
    createdAt: now,
    expiresAt: now + PENDING_2FA_TTL_MS,
  });
  return token;
}

/**
 * 验证待完成 2FA 令牌
 */
export function consumePending2FAToken(token: string): Pending2FAToken | null {
  const pending = pending2FATokens.get(token);
  if (!pending) return null;
  if (pending.expiresAt < Date.now()) {
    pending2FATokens.delete(token);
    return null;
  }
  pending2FATokens.delete(token);
  return pending;
}

/**
 * 2FA 登录验证（TOTP 码或备用码）
 * 成功后创建正式会话
 */
export async function verify2FALogin(
  token: string,
  code: string,
): Promise<{ user: LoginResponse; session: Session }> {
  const pending = consumePending2FAToken(token);
  if (!pending) {
    throw AppError.unauthorized('2FA 令牌无效或已过期');
  }

  const config = await loadConfig(pending.uid);
  if (!config?.enabled) {
    throw AppError.badRequest('TWO_FA_NOT_ENABLED', '2FA 未启用');
  }

  // 先尝试 TOTP 码
  const totpValid = validateTOTP(config.secret, code);
  if (totpValid) {
    return await createLoginSession(pending.uid, pending.username);
  }

  // 再尝试备用码
  const backupIdx = await findValidBackupCode(config, code);
  if (backupIdx >= 0) {
    // 标记备用码已使用
    config.backupCodes[backupIdx]!.used = true;
    await saveConfig(config);
    return await createLoginSession(pending.uid, pending.username);
  }

  throw AppError.unauthorized('验证码错误或已过期');
}

/**
 * 创建登录会话（复用 auth.dao 的 session 存储）
 */
async function createLoginSession(
  uid: number,
  username: string,
): Promise<{ user: LoginResponse; session: Session }> {
  const user = await dao.findUserByUid(uid);
  if (!user) throw AppError.notFound('用户');

  const { SESSION_TTL_MS } = await import('../../config.js');
  const now = Date.now();
  const session: Session = {
    sid: randomUUID(),
    uid,
    username,
    role: user.role,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  await dao.saveSession(session);

  return {
    user: {
      uid: user.uid,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    session,
  };
}

// ===== 工具函数 =====

/** 验证 TOTP 码（允许 ±1 时间窗口） */
function validateTOTP(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    ...TOTP_OPTIONS,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

/** 生成 10 个一次性备用码（格式：xxxxx-xxxxx） */
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const bytes = randomBytes(5);
    const hex = bytes.toString('hex').slice(0, 10);
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
  }
  return codes;
}

/** 查找有效的备用码（未使用且 bcrypt 匹配） */
async function findValidBackupCode(config: TwoFactorConfig, code: string): Promise<number> {
  for (let i = 0; i < config.backupCodes.length; i++) {
    const record = config.backupCodes[i]!;
    if (record.used) continue;
    const match = await bcrypt.compare(code, record.hash);
    if (match) return i;
  }
  return -1;
}

/** 导出用于测试 */
export { pending2FATokens as _pending2FATokens };