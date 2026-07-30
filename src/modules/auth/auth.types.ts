/**
 * auth 模块 — 类型定义
 */

/** 用户角色 */
export type UserRole = 'admin' | 'user';

/** 持久化用户记录 */
export interface AuthUser {
  uid: number;
  username: string;
  passwordHash: string;
  role: UserRole;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 服务端会话 */
export interface Session {
  sid: string;
  uid: number;
  username: string;
  role: UserRole;
  createdAt: number;
  expiresAt: number;
}

/** 登录请求 */
export interface LoginRequest {
  username: string;
  password: string;
}

/** 登录响应 */
export interface LoginResponse {
  uid: number;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
}

/** 修改密码请求 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** 当前用户信息 */
export interface CurrentUser {
  uid: number;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
}

/** 登录失败记录（内存） */
export interface LoginAttempt {
  count: number;
  lockedUntil: number;
}

// ===== 2FA / TOTP 类型 =====

/** 备用码记录（哈希存储） */
export interface BackupCodeRecord {
  /** bcrypt 哈希 */
  hash: string;
  /** 是否已使用 */
  used: boolean;
}

/** 用户 2FA 持久化配置（按 uid 分文件 JSON） */
export interface TwoFactorConfig {
  uid: number;
  /** TOTP secret（Base32） */
  secret: string;
  /** 是否已启用（verify 成功后为 true） */
  enabled: boolean;
  /** 备用码（bcrypt 哈希） */
  backupCodes: BackupCodeRecord[];
  /** 明文备用码（仅 setup→verify 后首次可见，查看后清空） */
  plainBackupCodes?: string[];
  createdAt: string;
  updatedAt: string;
}

/** 2FA setup 响应 */
export interface TwoFactorSetupResponse {
  secret: string;
  uri: string;
  qrDataUri: string;
}

/** 2FA verify 请求 */
export interface TwoFactorVerifyRequest {
  code: string;
}

/** 2FA disable 请求 */
export interface TwoFactorDisableRequest {
  password: string;
}

/** 2FA login 请求 */
export interface TwoFactorLoginRequest {
  token: string;
  code: string;
}

/** 2FA login 响应 */
export interface TwoFactorLoginResponse {
  user: LoginResponse;
  session: Session;
}

/** 待完成 2FA 的临时令牌（内存） */
export interface Pending2FAToken {
  uid: number;
  username: string;
  ip: string;
  createdAt: number;
  expiresAt: number;
}

/** 登录结果（可能要求 2FA） */
export type LoginResult =
  | { require2fa: false; user: LoginResponse; session: Session }
  | { require2fa: true; token: string };
