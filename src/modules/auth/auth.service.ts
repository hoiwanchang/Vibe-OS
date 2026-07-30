/**
 * auth 模块 — 业务逻辑层
 * 注册/登录/登出/改密/会话校验/锁定
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import {
  ADMIN_PASSWORD,
  LOGIN_LOCK_MS,
  LOGIN_MAX_ATTEMPTS,
  SESSION_TTL_MS,
} from '../../config.js';
import { AppError } from '../../common/app-error.js';
import * as dao from './auth.dao.js';
import type {
  AuthUser,
  ChangePasswordRequest,
  CurrentUser,
  LoginAttempt,
  LoginResponse,
  Session,
} from './auth.types.js';

const BCRYPT_COST = 12;

/** 内存中的登录失败记录：key = `${ip}:${username}` */
const loginAttempts = new Map<string, LoginAttempt>();

/**
 * 首次启动初始化：若 users.json 为空则创建 admin
 */
export async function initAuth(): Promise<void> {
  await dao.ensureAuthDirs();
  const users = await dao.loadUsers();
  if (users.length === 0) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_COST);
    const admin: AuthUser = {
      uid: 1000,
      username: 'admin',
      passwordHash: hash,
      role: 'admin',
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dao.addUser(admin);
  }
}

/**
 * 登录
 * @param username - 用户名
 * @param password - 密码
 * @param ip - 客户端 IP（用于锁定维度）
 * @returns 登录结果 + 新创建的 session
 */
export async function login(
  username: string,
  password: string,
  ip: string,
): Promise<{ user: LoginResponse; session: Session }> {
  const lockKey = `${ip}:${username}`;

  // 检查锁定
  const attempt = loginAttempts.get(lockKey);
  if (attempt && attempt.lockedUntil > Date.now()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', '账号已锁定，请 15 分钟后重试');
  }

  const user = await dao.findUserByUsername(username);
  if (!user) {
    recordFailedAttempt(lockKey);
    throw AppError.unauthorized('用户名或密码错误');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    recordFailedAttempt(lockKey);
    throw AppError.unauthorized('用户名或密码错误');
  }

  // 登录成功，清除失败记录
  loginAttempts.delete(lockKey);

  // 创建会话
  const session = await createSession(user);

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

/** 记录登录失败 */
function recordFailedAttempt(key: string): void {
  const attempt = loginAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
  attempt.count++;
  if (attempt.count >= LOGIN_MAX_ATTEMPTS) {
    attempt.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    attempt.count = 0;
  }
  loginAttempts.set(key, attempt);
}

/** 创建会话 */
async function createSession(user: AuthUser): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    sid: randomUUID(),
    uid: user.uid,
    username: user.username,
    role: user.role,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  await dao.saveSession(session);
  return session;
}

/**
 * 登出：销毁会话
 */
export async function logout(sid: string): Promise<void> {
  await dao.deleteSession(sid);
}

/**
 * 校验会话有效性
 * @returns session 或 null
 */
export async function validateSession(sid: string): Promise<Session | null> {
  const session = await dao.loadSession(sid);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    await dao.deleteSession(sid);
    return null;
  }
  return session;
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(uid: number): Promise<CurrentUser> {
  const user = await dao.findUserByUid(uid);
  if (!user) throw AppError.notFound('用户');
  return {
    uid: user.uid,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
}

/**
 * 修改密码
 */
export async function changePassword(
  uid: number,
  req: ChangePasswordRequest,
): Promise<void> {
  const user = await dao.findUserByUid(uid);
  if (!user) throw AppError.notFound('用户');

  const valid = await bcrypt.compare(req.currentPassword, user.passwordHash);
  if (!valid) {
    throw AppError.badRequest('WRONG_PASSWORD', '当前密码错误');
  }

  if (req.newPassword.length < 6) {
    throw AppError.badRequest('WEAK_PASSWORD', '新密码长度至少 6 位');
  }

  const hash = await bcrypt.hash(req.newPassword, BCRYPT_COST);
  await dao.updateUser(uid, { passwordHash: hash, mustChangePassword: false });

  // 销毁该用户所有会话（强制重新登录）
  await dao.deleteUserSessions(uid);
}

/**
 * 注册新用户（内部调用，与 user 模块对接）
 */
export async function registerUser(
  uid: number,
  username: string,
  password: string,
  role: 'admin' | 'user' = 'user',
): Promise<AuthUser> {
  const existing = await dao.findUserByUsername(username);
  if (existing) throw AppError.conflict(`用户名 [${username}] 已存在`);

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const user: AuthUser = {
    uid,
    username,
    passwordHash: hash,
    role,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await dao.addUser(user);
  return user;
}

/**
 * 删除用户认证记录（与 user 模块删除对接）
 */
export async function removeUser(uid: number): Promise<void> {
  await dao.deleteUser(uid);
  await dao.deleteUserSessions(uid);
}

/** 导出用于测试 */
export { loginAttempts as _loginAttempts };
