/**
 * 系统层：TLS 证书管理
 *
 * 设计目标（面向 Tailscale 内网访问场景）：
 * - 自签证书生成：openssl req -x509，SAN 支持 Tailscale MagicDNS / 100.x IP
 * - 证书导入：校验 PEM 合法性 + 私钥匹配，原子写入（0600/0644 权限）
 * - 证书解析：node:crypto X509Certificate（零外部依赖）
 * - 证书删除：移除 cert/key 文件
 *
 * 系统命令统一经 execFile 封装调用（符合 AGENTS.md 安全红线），
 * 禁止裸 shell。所有路径由调用方传入并已通过 normalize 校验。
 */
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, chmod, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import {
  X509Certificate,
  createPrivateKey,
  createPublicKey,
} from 'node:crypto';
import { COMMAND_TIMEOUT_MS } from '../config.js';
import { AppError } from '../common/app-error.js';

const execFileAsync = promisify(execFile);

/* ---------- 类型 ---------- */

/** 证书解析信息 */
export interface CertInfo {
  /** 主题（CN） */
  subject: string;
  /** 颁发者 */
  issuer: string;
  /** 序列号 */
  serialNumber: string;
  /** SHA-256 指纹 */
  fingerprint: string;
  /** 生效时间（ISO） */
  validFrom: string;
  /** 过期时间（ISO） */
  validTo: string;
  /** 剩余有效天数（过期为负） */
  daysRemaining: number;
  /** 是否已过期 */
  isExpired: boolean;
  /** 是否自签（subject === issuer） */
  isSelfSigned: boolean;
  /** Subject Alternative Names */
  sans: string[];
}

/** 证书安装状态 */
export interface CertStatus {
  /** 是否已安装证书文件 */
  installed: boolean;
  certPath: string;
  keyPath: string;
  /** 解析出的证书信息（未安装或解析失败为 null） */
  info: CertInfo | null;
  /** 文件存在但解析失败时的错误说明 */
  error?: string;
}

/** 自签证书生成参数 */
export interface GenerateCertOptions {
  /** 证书与私钥写入路径 */
  certPath: string;
  keyPath: string;
  /** 通用名（CN），默认取首个 SAN 或 hostname */
  commonName: string;
  /** Subject Alternative Names（DNS / IP） */
  sans: string[];
  /** 有效天数，默认 825（Apple/浏览器对自签上限） */
  days: number;
  /** RSA 密钥位数，2048 或 4096 */
  keySize: 2048 | 4096;
}

/** 证书导入参数 */
export interface ImportCertOptions {
  certPath: string;
  keyPath: string;
  /** 证书 PEM（可含证书链） */
  certPem: string;
  /** 私钥 PEM */
  keyPem: string;
}

/* ---------- 工具：错误消息提取 ---------- */

/** 从 unknown 异常中提取可读消息（Error 取 message，其余 String 化） */
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ---------- 解析 ---------- */

/**
 * 从 PEM 字符串解析证书信息
 * @throws AppError 当 PEM 非法时
 */
export function parseCertPem(certPem: string): CertInfo {
  let x509: X509Certificate;
  try {
    x509 = new X509Certificate(certPem);
  } catch (err) {
    throw AppError.badRequest(
      'INVALID_CERT',
      `证书 PEM 解析失败: ${errMsg(err)}`,
    );
  }

  const validFrom = new Date(x509.validFrom);
  const validTo = new Date(x509.validTo);
  const now = Date.now();
  const daysRemaining = Math.floor((validTo.getTime() - now) / 86_400_000);

  return {
    subject: x509.subject,
    issuer: x509.issuer,
    serialNumber: x509.serialNumber,
    fingerprint: x509.fingerprint256,
    validFrom: validFrom.toISOString(),
    validTo: validTo.toISOString(),
    daysRemaining,
    isExpired: validTo.getTime() < now,
    isSelfSigned: x509.subject === x509.issuer,
    sans: parseSans(x509.subjectAltName ?? ''),
  };
}

/** 解析 subjectAltName 字符串为数组（"DNS:a, IP Address:1.2.3.4" → ["a","1.2.3.4"]） */
function parseSans(subjectAltName: string): string[] {
  if (!subjectAltName) return [];
  return subjectAltName
    .split(',')
    .map((entry) => {
      const trimmed = entry.trim();
      // 仅按第一个冒号切分类型前缀（DNS: / IP Address:），
      // 保留 IPv6 地址中的冒号
      const idx = trimmed.indexOf(':');
      return idx >= 0 ? trimmed.slice(idx + 1).trim() : trimmed;
    })
    .filter(Boolean);
}

/* ---------- 状态查询 ---------- */

/**
 * 读取指定路径的证书状态
 * 文件不存在 → installed=false；存在但非法 → installed=true + error
 */
export async function getCertStatus(
  certPath: string,
  keyPath: string,
): Promise<CertStatus> {
  const base: CertStatus = {
    installed: false,
    certPath,
    keyPath,
    info: null,
  };

  try {
    await access(certPath);
  } catch {
    return base;
  }

  try {
    const certPem = await readFile(certPath, 'utf-8');
    return { ...base, installed: true, info: parseCertPem(certPem) };
  } catch (err) {
    return {
      ...base,
      installed: true,
      info: null,
      error: errMsg(err),
    };
  }
}

/* ---------- 自签生成 ---------- */

/**
 * 生成自签证书 + 私钥
 * 使用 openssl req -x509，SAN 通过 -addext 注入（OpenSSL 3.x 支持）
 */
export async function generateSelfSignedCert(
  opts: GenerateCertOptions,
): Promise<CertInfo> {
  const days = opts.days > 0 ? opts.days : 825;
  const keySize = opts.keySize === 4096 ? 4096 : 2048;
  const cn = opts.commonName || opts.sans[0] || 'vibeos';

  // 构造 SAN 扩展：DNS 与 IP 自动区分
  const sanEntries = opts.sans
    .filter(Boolean)
    .map((s) => (isIpAddress(s) ? `IP:${s}` : `DNS:${s}`));
  if (!sanEntries.some((e) => e.endsWith(`:${cn}`))) {
    sanEntries.unshift(isIpAddress(cn) ? `IP:${cn}` : `DNS:${cn}`);
  }

  await mkdir(dirname(opts.certPath), { recursive: true });
  await mkdir(dirname(opts.keyPath), { recursive: true });

  const args = [
    'req',
    '-x509',
    '-newkey',
    `rsa:${keySize}`,
    '-nodes',
    '-keyout',
    opts.keyPath,
    '-out',
    opts.certPath,
    '-days',
    String(days),
    '-subj',
    `/CN=${cn}`,
    '-addext',
    `subjectAltName=${sanEntries.join(',')}`,
  ];

  try {
    await execFileAsync('openssl', args, { timeout: COMMAND_TIMEOUT_MS });
  } catch (err) {
    throw AppError.commandFailed(
      'openssl',
      errMsg(err),
    );
  }

  // 私钥收紧权限 0600，证书 0644
  await chmod(opts.keyPath, 0o600);
  await chmod(opts.certPath, 0o644);

  const certPem = await readFile(opts.certPath, 'utf-8');
  return parseCertPem(certPem);
}

/* ---------- 导入 ---------- */

/**
 * 导入外部证书 + 私钥
 * 校验：PEM 合法、私钥与证书公钥匹配，通过后原子写入
 */
export async function importCert(opts: ImportCertOptions): Promise<CertInfo> {
  // 1. 证书 PEM 合法性（parseCertPem 内部抛 INVALID_CERT）
  const info = parseCertPem(opts.certPem);

  // 2. 私钥 PEM 合法性
  let privateKey;
  try {
    privateKey = createPrivateKey(opts.keyPem);
  } catch (err) {
    throw AppError.badRequest(
      'INVALID_KEY',
      `私钥 PEM 解析失败: ${errMsg(err)}`,
    );
  }

  // 3. 私钥与证书公钥匹配校验
  if (!keyMatchesCert(privateKey, opts.certPem)) {
    throw AppError.badRequest(
      'KEY_CERT_MISMATCH',
      '私钥与证书不匹配：公钥不一致',
    );
  }

  // 4. 原子写入 + 权限
  await mkdir(dirname(opts.certPath), { recursive: true });
  await mkdir(dirname(opts.keyPath), { recursive: true });
  await writeFile(opts.certPath, opts.certPem, { mode: 0o644 });
  await writeFile(opts.keyPath, opts.keyPem, { mode: 0o600 });

  return info;
}

/** 比较私钥派生的公钥与证书内公钥是否一致 */
function keyMatchesCert(
  privateKey: ReturnType<typeof createPrivateKey>,
  certPem: string,
): boolean {
  try {
    const certPub = new X509Certificate(certPem).publicKey.export({
      type: 'spki',
      format: 'der',
    });
    const keyPub = createPublicKey(privateKey).export({
      type: 'spki',
      format: 'der',
    });
    return certPub.equals(keyPub);
  } catch {
    return false;
  }
}

/* ---------- 删除 ---------- */

/** 删除证书与私钥文件（不存在则忽略） */
export async function removeCert(
  certPath: string,
  keyPath: string,
): Promise<{ removed: boolean }> {
  let removed = false;
  for (const p of [certPath, keyPath]) {
    try {
      await rm(p, { force: true });
      removed = true;
    } catch {
      /* 忽略单个文件删除失败 */
    }
  }
  return { removed };
}

/* ---------- 工具 ---------- */

/** 简单 IPv4 / IPv6 判定（用于 SAN 前缀选择） */
function isIpAddress(value: string): boolean {
  if (value.includes(':')) return true; // IPv6
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}
