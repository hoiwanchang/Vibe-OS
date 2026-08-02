/**
 * 模块：FTP/SFTP 服务管理 — 数据访问层
 * 负责 FTP/SFTP 配置与用户权限的 JSON 持久化
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import {
  DEFAULT_FTP_CONFIG,
  DEFAULT_SFTP_CONFIG,
  type FtpConfig,
  type FtpUserPermission,
  type SftpConfig,
} from './ftp.types.js';

/** FTP 配置文件路径 */
const FTP_CONFIG_FILE = path.join(VIBEOS_APP_DIR, 'settings', 'ftp.json');

/** 用户权限文件路径 */
const FTP_USERS_FILE = path.join(VIBEOS_APP_DIR, 'settings', 'ftp-users.json');

/** 持久化数据结构 */
interface FtpSettings {
  ftp: FtpConfig;
  sftp: SftpConfig;
}

/**
 * 读取 FTP/SFTP 配置
 * 文件不存在或损坏时返回默认配置
 */
export async function loadConfig(): Promise<FtpSettings> {
  try {
    const raw = await fs.readFile(FTP_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FtpSettings>;
    return {
      ftp: { ...DEFAULT_FTP_CONFIG, ...parsed.ftp },
      sftp: { ...DEFAULT_SFTP_CONFIG, ...parsed.sftp },
    };
  } catch {
    return {
      ftp: { ...DEFAULT_FTP_CONFIG },
      sftp: { ...DEFAULT_SFTP_CONFIG },
    };
  }
}

/**
 * 写入 FTP/SFTP 配置（覆盖写入）
 */
export async function saveConfig(settings: FtpSettings): Promise<void> {
  await ensureDir(path.dirname(FTP_CONFIG_FILE));
  await fs.writeFile(FTP_CONFIG_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * 读取全部用户 FTP 权限（按 uid 索引）
 * 文件不存在或损坏时返回空对象
 */
export async function loadUserPermissions(): Promise<Record<number, FtpUserPermission>> {
  try {
    const raw = await fs.readFile(FTP_USERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, FtpUserPermission>;
    if (!parsed || typeof parsed !== 'object') return {};
    // 键转回 number
    const result: Record<number, FtpUserPermission> = {};
    for (const [k, v] of Object.entries(parsed)) {
      result[Number(k)] = v;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * 写入全部用户 FTP 权限（覆盖写入）
 */
export async function saveUserPermissions(
  permissions: Record<number, FtpUserPermission>,
): Promise<void> {
  await ensureDir(path.dirname(FTP_USERS_FILE));
  await fs.writeFile(FTP_USERS_FILE, JSON.stringify(permissions, null, 2), 'utf-8');
}
