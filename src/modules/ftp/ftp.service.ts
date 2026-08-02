/**
 * 模块：FTP/SFTP 服务管理 — 业务逻辑层
 * 管理 vsftpd(FTP) 和 sshd(SFTP) 的配置与生命周期
 */
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import * as dao from './ftp.dao.js';
import {
  type FtpConfig,
  type FtpConfigUpdate,
  type FtpLogEntry,
  type FtpStatus,
  type FtpUserPermission,
  type FtpUserPermissionUpdate,
  type SftpConfig,
} from './ftp.types.js';

/** vsftpd 服务名 */
const VSFTPD_SERVICE = 'vsftpd';
/** sshd 服务名 */
const SSHD_SERVICE = 'sshd';

/**
 * 获取 FTP/SFTP 服务状态
 * 通过 systemctl is-active 检测服务运行状态
 */
export async function getStatus(): Promise<FtpStatus> {
  const settings = await dao.loadConfig();

  const [ftpResult, sftpResult] = await Promise.all([
    executeCommand('systemctl', ['is-active', VSFTPD_SERVICE]),
    executeCommand('systemctl', ['is-active', SSHD_SERVICE]),
  ]);

  return {
    ftpRunning: ftpResult.stdout.trim() === 'active',
    sftpRunning: sftpResult.stdout.trim() === 'active',
    ftpConfig: settings.ftp,
    sftpConfig: settings.sftp,
  };
}

/**
 * 更新 FTP/SFTP 配置
 * 合并更新后持久化，并生成 vsftpd 配置（通过 systemctl reload 生效）
 * @param update - 待更新的配置字段
 * @returns 更新后的完整配置
 */
export async function updateConfig(update: FtpConfigUpdate): Promise<{ ftp: FtpConfig; sftp: SftpConfig }> {
  const settings = await dao.loadConfig();

  const ftp: FtpConfig = {
    port: update.port ?? settings.ftp.port,
    passivePortMin: update.passivePortMin ?? settings.ftp.passivePortMin,
    passivePortMax: update.passivePortMax ?? settings.ftp.passivePortMax,
    anonymousAccess: update.anonymousAccess ?? settings.ftp.anonymousAccess,
    tlsEnabled: update.tlsEnabled ?? settings.ftp.tlsEnabled,
    tlsCertPath: update.tlsCertPath ?? settings.ftp.tlsCertPath,
    tlsKeyPath: update.tlsKeyPath ?? settings.ftp.tlsKeyPath,
  };

  // 校验端口范围
  if (ftp.passivePortMin > ftp.passivePortMax) {
    throw AppError.badRequest('VALIDATION_ERROR', '被动模式端口范围下限不能大于上限');
  }
  if (ftp.port < 1 || ftp.port > 65535) {
    throw AppError.badRequest('VALIDATION_ERROR', 'FTP 端口必须在 1-65535 之间');
  }

  const sftp: SftpConfig = {
    enabled: update.sftpEnabled ?? settings.sftp.enabled,
    chrootDirectory: update.sftpChrootDirectory ?? settings.sftp.chrootDirectory,
  };

  await dao.saveConfig({ ftp, sftp });

  // 重新加载 vsftpd 配置使其生效
  await executeCommand('systemctl', ['reload-or-restart', VSFTPD_SERVICE]);

  return { ftp, sftp };
}

/**
 * 启动 FTP 服务（vsftpd）
 */
export async function startFtp(): Promise<{ service: string; action: string }> {
  await executeCommandStrict('systemctl', ['start', VSFTPD_SERVICE]);
  return { service: VSFTPD_SERVICE, action: 'start' };
}

/**
 * 停止 FTP 服务（vsftpd）
 */
export async function stopFtp(): Promise<{ service: string; action: string }> {
  await executeCommandStrict('systemctl', ['stop', VSFTPD_SERVICE]);
  return { service: VSFTPD_SERVICE, action: 'stop' };
}

/**
 * 重启 FTP 服务（vsftpd）
 */
export async function restartFtp(): Promise<{ service: string; action: string }> {
  await executeCommandStrict('systemctl', ['restart', VSFTPD_SERVICE]);
  return { service: VSFTPD_SERVICE, action: 'restart' };
}

/**
 * 获取 FTP 连接日志
 * 解析 vsftpd 日志（通过 journalctl 获取）
 * @param limit - 返回条目数上限，默认 100
 */
export async function getLogs(limit = 100): Promise<FtpLogEntry[]> {
  const result = await executeCommand('journalctl', [
    '-u', VSFTPD_SERVICE,
    '--no-pager',
    '-n', String(limit),
    '-o', 'short-iso',
  ]);

  if (result.exitCode !== 0) {
    return [];
  }

  const entries: FtpLogEntry[] = [];
  const lines = result.stdout.trim().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    // 解析 journalctl short-iso 格式: 2024-01-01T00:00:00+0000 hostname vsftpd[pid]: message
    const match = line.match(/^(\S+)\s+\S+\s+\S+\s+(.*)$/);
    if (match) {
      const timestamp = match[1] ?? '';
      const message = match[2] ?? '';
      const action = message.includes('LOGIN') ? 'login'
        : message.includes('UPLOAD') ? 'upload'
        : message.includes('DOWNLOAD') ? 'download'
        : message.includes('FAIL') ? 'error'
        : 'other';
      entries.push({ timestamp, user: '', action, detail: message });
    }
  }
  return entries;
}

/**
 * 获取用户 FTP 权限
 * @param uid - 用户 UID
 */
export async function getUserPermission(uid: number): Promise<FtpUserPermission> {
  const permissions = await dao.loadUserPermissions();
  return permissions[uid] ?? {
    uid,
    allowed: true,
    rootDir: '',
    bandwidthLimitKbps: 0,
  };
}

/**
 * 更新用户 FTP 权限
 * @param uid - 用户 UID
 * @param update - 待更新的权限字段
 * @returns 更新后的完整权限
 */
export async function updateUserPermission(
  uid: number,
  update: FtpUserPermissionUpdate,
): Promise<FtpUserPermission> {
  const permissions = await dao.loadUserPermissions();
  const current = permissions[uid] ?? {
    uid,
    allowed: true,
    rootDir: '',
    bandwidthLimitKbps: 0,
  };

  const updated: FtpUserPermission = {
    uid,
    allowed: update.allowed ?? current.allowed,
    rootDir: update.rootDir ?? current.rootDir,
    bandwidthLimitKbps: update.bandwidthLimitKbps ?? current.bandwidthLimitKbps,
  };

  if (updated.bandwidthLimitKbps < 0) {
    throw AppError.badRequest('VALIDATION_ERROR', '带宽限制不能为负数');
  }

  permissions[uid] = updated;
  await dao.saveUserPermissions(permissions);
  return updated;
}
