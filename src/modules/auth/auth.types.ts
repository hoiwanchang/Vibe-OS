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
