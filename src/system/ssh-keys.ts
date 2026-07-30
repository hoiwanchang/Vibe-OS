/**
 * 系统层：SSH 密钥管理
 *
 * 设计目标（面向内网 NAS 的免密登录场景）：
 * - 列举 authorized_keys：逐行解析，ssh-keygen -lf 计算指纹/类型
 * - 导入公钥：校验合法性（ssh-keygen -lf）+ 去重，原子追加（0600 权限）
 * - 生成密钥对：ssh-keygen 生成 ed25519/RSA，返回公钥+私钥（私钥仅返回一次）
 * - 删除公钥：按指纹匹配移除 authorized_keys 中对应行
 *
 * 系统命令统一经 execFile 封装调用（符合 AGENTS.md 安全红线），禁止裸 shell。
 * authorized_keys 文件路径由调用方（service 层）解析并校验，本层不做用户家目录推断。
 */
import { execFile } from 'node:child_process';
import {
  readFile,
  writeFile,
  mkdir,
  chmod,
  mkdtemp,
  rm,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { COMMAND_TIMEOUT_MS } from '../config.js';
import { AppError } from '../common/app-error.js';

const execFileAsync = promisify(execFile);

/* ---------- 类型 ---------- */

/** 单条 authorized_keys 公钥信息 */
export interface SshPublicKey {
  /** SHA256 指纹（ssh-keygen 标准格式，如 SHA256:xxxx） */
  fingerprint: string;
  /** 密钥类型（ED25519 / RSA / ECDSA） */
  type: string;
  /** 密钥位数 */
  bits: number;
  /** 注释（通常为 user@host） */
  comment: string;
  /** 原始 authorized_keys 行（含可选 options 前缀） */
  raw: string;
  /** 是否合法（无法解析的残留行标记为 false） */
  valid: boolean;
}

/** 密钥对生成参数 */
export interface GenerateSshKeyOptions {
  /** 密钥类型 */
  type: 'ed25519' | 'rsa';
  /** RSA 位数（仅 type=rsa 生效），2048 或 4096 */
  bits?: 2048 | 4096;
  /** 注释（默认 user@vibeos） */
  comment?: string;
}

/** 生成的密钥对结果 */
export interface GeneratedSshKey {
  /** 公钥（authorized_keys 格式，可直接导入） */
  publicKey: string;
  /** 私钥 PEM（仅返回一次，请妥善保存） */
  privateKey: string;
  /** 公钥指纹 */
  fingerprint: string;
  /** 密钥类型 */
  type: string;
}

/* ---------- 工具 ---------- */

/** 从 unknown 异常提取可读消息 */
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 在隔离临时目录中执行回调，结束后清理
 * 避免在共享目录留下密钥碎片
 */
async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'vibeos-sshkey-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * 用 ssh-keygen -lf 解析单条公钥的指纹/类型/位数
 * @returns 解析结果；非法公钥返回 null
 */
async function inspectPublicKey(
  keyLine: string,
): Promise<{ fingerprint: string; type: string; bits: number } | null> {
  return withTempDir(async (dir) => {
    const keyFile = join(dir, 'key.pub');
    await writeFile(keyFile, `${keyLine.trim()}\n`, { mode: 0o600 });
    try {
      const { stdout } = await execFileAsync('ssh-keygen', ['-lf', keyFile], {
        timeout: COMMAND_TIMEOUT_MS,
      });
      // 输出格式: "256 SHA256:xxxx comment (ED25519)"
      const match = stdout
        .trim()
        .match(/^(\d+)\s+(\S+)\s+.*\((\w+)\)\s*$/);
      if (!match) return null;
      return {
        bits: parseInt(match[1] ?? '0', 10),
        fingerprint: match[2] ?? '',
        type: match[3] ?? '',
      };
    } catch {
      return null;
    }
  });
}

/* ---------- 列举 ---------- */

/**
 * 列举 authorized_keys 中的全部公钥
 * 文件不存在返回空数组（不视为错误）
 */
export async function listAuthorizedKeys(
  keysFile: string,
): Promise<SshPublicKey[]> {
  let content: string;
  try {
    content = await readFile(keysFile, 'utf-8');
  } catch {
    return [];
  }

  const results: SshPublicKey[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // 跳过空行与注释行
    if (!trimmed || trimmed.startsWith('#')) continue;

    const info = await inspectPublicKey(trimmed);
    if (info) {
      // comment = 去掉 keytype+base64 后的尾部（可能含 options 前缀，取最后可读段）
      const parts = trimmed.split(/\s+/);
      const comment = parts.slice(2).join(' ') || '';
      results.push({
        fingerprint: info.fingerprint,
        type: info.type,
        bits: info.bits,
        comment,
        raw: trimmed,
        valid: true,
      });
    } else {
      // 无法解析的残留行也返回，标记 valid=false 供前端展示
      results.push({
        fingerprint: '',
        type: 'UNKNOWN',
        bits: 0,
        comment: trimmed.slice(0, 40),
        raw: trimmed,
        valid: false,
      });
    }
  }
  return results;
}

/* ---------- 导入 ---------- */

/**
 * 导入一条公钥到 authorized_keys
 * 校验合法性 + 指纹去重，原子追加，权限收紧 0600
 * @throws AppError 当公钥非法或已存在时
 */
export async function importPublicKey(
  keysFile: string,
  publicKey: string,
): Promise<SshPublicKey> {
  const normalized = publicKey.trim();
  if (!normalized) {
    throw AppError.badRequest('INVALID_KEY', '公钥不能为空');
  }

  // 1. 合法性校验（ssh-keygen -lf）
  const info = await inspectPublicKey(normalized);
  if (!info) {
    throw AppError.badRequest(
      'INVALID_KEY',
      '公钥格式非法：无法被 ssh-keygen 解析',
    );
  }

  // 2. 去重校验（按指纹）
  const existing = await listAuthorizedKeys(keysFile);
  if (existing.some((k) => k.fingerprint === info.fingerprint)) {
    throw AppError.conflict('该公钥已存在（指纹重复）');
  }

  // 3. 原子追加
  await mkdir(dirname(keysFile), { recursive: true });
  let current = '';
  try {
    current = await readFile(keysFile, 'utf-8');
  } catch {
    current = '';
  }
  const needsNewline = current.length > 0 && !current.endsWith('\n');
  const next = `${current}${needsNewline ? '\n' : ''}${normalized}\n`;
  await writeFile(keysFile, next, { mode: 0o600 });
  await chmod(keysFile, 0o600);

  const parts = normalized.split(/\s+/);
  return {
    fingerprint: info.fingerprint,
    type: info.type,
    bits: info.bits,
    comment: parts.slice(2).join(' ') || '',
    raw: normalized,
    valid: true,
  };
}

/* ---------- 删除 ---------- */

/**
 * 按指纹删除 authorized_keys 中的公钥
 * @returns removed=true 表示命中并移除
 */
export async function removePublicKey(
  keysFile: string,
  fingerprint: string,
): Promise<{ removed: boolean }> {
  const target = fingerprint.trim();
  if (!target) {
    throw AppError.badRequest('INVALID_PARAM', '指纹不能为空');
  }

  let content: string;
  try {
    content = await readFile(keysFile, 'utf-8');
  } catch {
    return { removed: false };
  }

  const lines = content.split('\n');
  const kept: string[] = [];
  let removed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      kept.push(line);
      continue;
    }
    const info = await inspectPublicKey(trimmed);
    if (info && info.fingerprint === target) {
      removed = true; // 命中，跳过（删除）
      continue;
    }
    kept.push(line);
  }

  if (removed) {
    await writeFile(keysFile, kept.join('\n'), { mode: 0o600 });
    await chmod(keysFile, 0o600);
  }
  return { removed };
}

/* ---------- 生成密钥对 ---------- */

/**
 * 生成 SSH 密钥对（ed25519 / RSA）
 * 私钥仅在此返回值中出现一次，调用方负责交付给用户后不落盘
 * @throws AppError 当 ssh-keygen 执行失败时
 */
export async function generateKeyPair(
  opts: GenerateSshKeyOptions,
): Promise<GeneratedSshKey> {
  const type = opts.type === 'rsa' ? 'rsa' : 'ed25519';
  const comment = opts.comment?.trim() || 'vibeos@local';

  return withTempDir(async (dir) => {
    const privPath = join(dir, 'id_key');
    const args = ['-t', type, '-f', privPath, '-N', '', '-C', comment];
    if (type === 'rsa') {
      const bits = opts.bits === 4096 ? 4096 : 2048;
      args.push('-b', String(bits));
    }

    try {
      await execFileAsync('ssh-keygen', args, { timeout: COMMAND_TIMEOUT_MS });
    } catch (err) {
      throw AppError.commandFailed('ssh-keygen', errMsg(err));
    }

    const [privateKey, publicKey] = await Promise.all([
      readFile(privPath, 'utf-8'),
      readFile(`${privPath}.pub`, 'utf-8'),
    ]);

    const info = await inspectPublicKey(publicKey);
    return {
      publicKey: publicKey.trim(),
      privateKey,
      fingerprint: info?.fingerprint ?? '',
      type: info?.type ?? type.toUpperCase(),
    };
  });
}
