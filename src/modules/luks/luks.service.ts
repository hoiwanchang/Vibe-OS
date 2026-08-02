/**
 * 模块：LUKS 卷加密 — 业务逻辑层
 *
 * 安全约束：
 * - passphrase 通过 tmpfs 临时文件传递给 cryptsetup，用完即删，不落盘、不记日志
 * - keyfile 存储于 /data/vibeos/secrets/luks/（0700 目录 + 0600 文件）
 * - 所有 cryptsetup 命令通过 executeCommand / executeCommandStrict 执行
 */
import * as fs from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { SECRETS_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import { ensureDir } from '../../system/filesystem.js';
import type { LuksVolumeStatus, LuksKeyfileResult } from './luks.types.js';

/** LUKS 密钥存储目录（0700） */
const LUKS_SECRETS_DIR = `${SECRETS_DIR}/luks`;

/** 临时 passphrase 文件目录（/run 为 tmpfs，重启即清空，不落盘） */
const PASSPHRASE_TMP_DIR = '/run/vibeos-luks';

/** /etc/crypttab 路径 */
const CRYPTTAB_PATH = '/etc/crypttab';

/**
 * 将 passphrase / keyfile 统一解析为 cryptsetup --key-file 参数。
 * passphrase 写入 tmpfs 临时文件（0600），返回清理回调；keyfile 直接引用路径。
 * 安全保证：passphrase 不出现在命令行参数、日志或磁盘中。
 */
async function resolveKeyArgs(
  passphrase?: string,
  keyfile?: string,
): Promise<{ args: string[]; cleanup: () => Promise<void> }> {
  if (keyfile) {
    return { args: ['--key-file', keyfile], cleanup: async () => {} };
  }
  if (passphrase) {
    await fs.mkdir(PASSPHRASE_TMP_DIR, { recursive: true, mode: 0o700 });
    const tmpFile = `${PASSPHRASE_TMP_DIR}/tmp-${randomUUID()}`;
    await fs.writeFile(tmpFile, passphrase, { mode: 0o600 });
    return {
      args: ['--key-file', tmpFile],
      cleanup: async () => {
        await fs.unlink(tmpFile).catch(() => {});
      },
    };
  }
  throw AppError.badRequest('NO_CREDENTIAL', '必须提供 passphrase 或 keyfile');
}

/**
 * 创建 LUKS2 加密卷
 * @param device - 块设备路径（如 /dev/sdb）
 * @param passphrase - 密码（与 keyfile 二选一）
 * @param keyfile - 密钥文件路径（与 passphrase 二选一）
 */
export async function createVolume(
  device: string,
  passphrase?: string,
  keyfile?: string,
): Promise<{ device: string; type: string }> {
  const { args, cleanup } = await resolveKeyArgs(passphrase, keyfile);
  try {
    await executeCommandStrict(
      'cryptsetup',
      ['luksFormat', '--type', 'luks2', '--batch-mode', ...args, device],
      300_000,
    );
  } finally {
    await cleanup();
  }
  return { device, type: 'luks2' };
}

/**
 * 解锁（打开）LUKS 卷，创建 /dev/mapper/<name> 映射
 */
export async function openVolume(
  device: string,
  name: string,
  passphrase?: string,
  keyfile?: string,
): Promise<{ name: string; device: string; mapperPath: string }> {
  const { args, cleanup } = await resolveKeyArgs(passphrase, keyfile);
  try {
    await executeCommandStrict('cryptsetup', ['open', ...args, device, name]);
  } finally {
    await cleanup();
  }
  return { name, device, mapperPath: `/dev/mapper/${name}` };
}

/**
 * 锁定（关闭）LUKS 卷，移除 /dev/mapper/<name> 映射
 */
export async function closeVolume(name: string): Promise<{ name: string; closed: boolean }> {
  await executeCommandStrict('cryptsetup', ['close', name]);
  return { name, closed: true };
}

/**
 * 解析 cryptsetup status 输出为结构化对象
 */
function parseCryptsetupStatus(name: string, output: string): LuksVolumeStatus {
  const status: LuksVolumeStatus = {
    name,
    device: '',
    active: false,
    type: '',
    cipher: '',
    keysize: '',
    mode: '',
    offset: '',
    size: '',
  };

  for (const line of output.split('\n')) {
    if (line.includes('is active')) status.active = true;

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s+type:\s+(.+)/))) status.type = (m[1] ?? '').trim();
    else if ((m = line.match(/^\s+cipher:\s+(.+)/))) status.cipher = (m[1] ?? '').trim();
    else if ((m = line.match(/^\s+keysize:\s+(.+)/))) status.keysize = (m[1] ?? '').trim();
    else if ((m = line.match(/^\s+device:\s+(.+)/))) status.device = (m[1] ?? '').trim();
    else if ((m = line.match(/^\s+mode:\s+(.+)/))) status.mode = (m[1] ?? '').trim();
    else if ((m = line.match(/^\s+offset:\s+(.+)/))) status.offset = (m[1] ?? '').trim();
    else if ((m = line.match(/^\s+size:\s+(.+)/))) status.size = (m[1] ?? '').trim();
  }

  return status;
}

/**
 * 获取单个 LUKS 卷状态
 * @returns 卷状态，卷不存在或未激活时返回 null
 */
export async function getVolumeStatus(name: string): Promise<LuksVolumeStatus | null> {
  const result = await executeCommand('cryptsetup', ['status', name]);
  if (result.exitCode !== 0) return null;
  return parseCryptsetupStatus(name, result.stdout);
}

/**
 * 列出所有已映射的 LUKS 卷状态
 * 遍历 /dev/mapper/ 下的条目，逐一查询 cryptsetup status
 */
export async function listStatus(): Promise<LuksVolumeStatus[]> {
  let entries: string[];
  try {
    entries = await fs.readdir('/dev/mapper');
  } catch {
    return [];
  }

  const volumes: LuksVolumeStatus[] = [];
  for (const entry of entries) {
    if (entry === 'control') continue;
    const status = await getVolumeStatus(entry);
    if (status) volumes.push(status);
  }
  return volumes;
}

/**
 * 生成 LUKS keyfile（64 字节随机数据）
 * 存储于 /data/vibeos/secrets/luks/<name>.key，权限 0600
 */
export async function generateKeyfile(name: string): Promise<LuksKeyfileResult> {
  await ensureDir(LUKS_SECRETS_DIR, 0o700);
  const keyPath = `${LUKS_SECRETS_DIR}/${name}.key`;
  const keyData = randomBytes(64);
  await fs.writeFile(keyPath, keyData, { mode: 0o600 });
  return { name, path: keyPath };
}

/**
 * 配置开机自动解锁（写入 /etc/crypttab）
 * 格式：<name> <device> <keyfile> luks,discard
 * 若同名条目已存在则原地更新，否则追加
 */
export async function configureAutounlock(
  name: string,
  device: string,
  keyfile?: string,
): Promise<{ name: string; device: string; keyfile: string }> {
  const keyPath = keyfile ?? `${LUKS_SECRETS_DIR}/${name}.key`;

  // 验证密钥文件存在
  try {
    await fs.access(keyPath);
  } catch {
    throw AppError.notFound(`密钥文件 [${keyPath}]`);
  }

  // 读取现有 crypttab（不存在则从空开始）
  let content = '';
  try {
    content = await fs.readFile(CRYPTTAB_PATH, 'utf-8');
  } catch {
    // 文件不存在
  }

  const lines = content.split('\n');
  const entry = `${name} ${device} ${keyPath} luks,discard`;
  const existingIdx = lines.findIndex(
    (l) => !l.startsWith('#') && l.trim().split(/\s+/)[0] === name,
  );

  if (existingIdx >= 0) {
    lines[existingIdx] = entry;
  } else {
    // 移除末尾空行后追加
    while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') lines.pop();
    lines.push(entry);
  }

  await fs.writeFile(CRYPTTAB_PATH, `${lines.join('\n')}\n`, { mode: 0o644 });

  return { name, device, keyfile: keyPath };
}
