/**
 * 模块：FTP/SFTP 服务管理 — 类型定义
 */

/** FTP 服务配置 */
export interface FtpConfig {
  /** vsftpd 监听端口，默认 21 */
  port: number;
  /** 被动模式端口范围下限 */
  passivePortMin: number;
  /** 被动模式端口范围上限 */
  passivePortMax: number;
  /** 是否允许匿名访问 */
  anonymousAccess: boolean;
  /** 是否启用 TLS/FTPS */
  tlsEnabled: boolean;
  /** TLS 证书路径 */
  tlsCertPath: string;
  /** TLS 私钥路径 */
  tlsKeyPath: string;
}

/** SFTP 服务配置（复用 sshd） */
export interface SftpConfig {
  /** 是否启用 SFTP 子系统 */
  enabled: boolean;
  /** sftp-only 用户的 ChrootDirectory 模板（%u 替换为用户名） */
  chrootDirectory: string;
}

/** 用户级 FTP 权限 */
export interface FtpUserPermission {
  /** 用户 UID */
  uid: number;
  /** 是否允许 FTP 访问 */
  allowed: boolean;
  /** FTP 根目录限定（空字符串表示使用默认用户目录） */
  rootDir: string;
  /** 带宽限制（KB/s），0 表示不限制 */
  bandwidthLimitKbps: number;
}

/** FTP/SFTP 服务状态 */
export interface FtpStatus {
  /** vsftpd 是否正在运行 */
  ftpRunning: boolean;
  /** sshd（SFTP）是否正在运行 */
  sftpRunning: boolean;
  /** FTP 配置 */
  ftpConfig: FtpConfig;
  /** SFTP 配置 */
  sftpConfig: SftpConfig;
}

/** FTP 连接日志条目 */
export interface FtpLogEntry {
  /** 时间戳（ISO 8601） */
  timestamp: string;
  /** 用户名 */
  user: string;
  /** 操作类型（login / logout / upload / download / error） */
  action: string;
  /** 详细信息 */
  detail: string;
}

/** FTP 配置更新请求（部分字段） */
export interface FtpConfigUpdate {
  port?: number;
  passivePortMin?: number;
  passivePortMax?: number;
  anonymousAccess?: boolean;
  tlsEnabled?: boolean;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  sftpEnabled?: boolean;
  sftpChrootDirectory?: string;
}

/** 用户权限更新请求 */
export interface FtpUserPermissionUpdate {
  allowed?: boolean;
  rootDir?: string;
  bandwidthLimitKbps?: number;
}

/** 默认 FTP 配置 */
export const DEFAULT_FTP_CONFIG: FtpConfig = {
  port: 21,
  passivePortMin: 30000,
  passivePortMax: 30100,
  anonymousAccess: false,
  tlsEnabled: false,
  tlsCertPath: '',
  tlsKeyPath: '',
};

/** 默认 SFTP 配置 */
export const DEFAULT_SFTP_CONFIG: SftpConfig = {
  enabled: true,
  chrootDirectory: '/data/%u',
};
