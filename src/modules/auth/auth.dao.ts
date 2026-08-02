/**
 * auth 模块 — 持久化层
 * 用户存 /data/vibeos/auth/users.json
 * 会话存 /data/vibeos/auth/sessions/{sid}.json
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import type { AuthUser, Session } from './auth.types.js';

const AUTH_DIR = path.join(VIBEOS_APP_DIR, 'auth');
const USERS_FILE = path.join(AUTH_DIR, 'users.json');
const SESSIONS_DIR = path.join(AUTH_DIR, 'sessions');

/** 确保 auth 目录结构存在 */
export async function ensureAuthDirs(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

/** 读取所有用户 */
export async function loadUsers(): Promise<AuthUser[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(raw) as AuthUser[];
  } catch {
    return [];
  }
}

/** 写入所有用户 */
export async function saveUsers(users: AuthUser[]): Promise<void> {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

/** 按用户名查找 */
export async function findUserByUsername(username: string): Promise<AuthUser | null> {
  const users = await loadUsers();
  return users.find((u) => u.username === username) ?? null;
}

/** 按 uid 查找 */
export async function findUserByUid(uid: number): Promise<AuthUser | null> {
  const users = await loadUsers();
  return users.find((u) => u.uid === uid) ?? null;
}

/** 添加用户 */
export async function addUser(user: AuthUser): Promise<void> {
  const users = await loadUsers();
  users.push(user);
  await saveUsers(users);
}

/** 更新用户（按 uid） */
export async function updateUser(uid: number, patch: Partial<Omit<AuthUser, 'uid'>>): Promise<void> {
  const users = await loadUsers();
  const idx = users.findIndex((u) => u.uid === uid);
  if (idx === -1) return;
  const existing = users[idx]!;
  users[idx] = {
    uid: existing.uid,
    username: patch.username ?? existing.username,
    passwordHash: patch.passwordHash ?? existing.passwordHash,
    role: patch.role ?? existing.role,
    mustChangePassword: patch.mustChangePassword ?? existing.mustChangePassword,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await saveUsers(users);
}

/** 删除用户（按 uid） */
export async function deleteUser(uid: number): Promise<void> {
  const users = await loadUsers();
  await saveUsers(users.filter((u) => u.uid !== uid));
}

// ===== 会话管理 =====

/** 保存会话 */
export async function saveSession(session: Session): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  const file = path.join(SESSIONS_DIR, `${session.sid}.json`);
  await fs.writeFile(file, JSON.stringify(session), 'utf-8');
}

/** 读取会话 */
export async function loadSession(sid: string): Promise<Session | null> {
  try {
    const file = path.join(SESSIONS_DIR, `${sid}.json`);
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

/** 删除会话 */
export async function deleteSession(sid: string): Promise<void> {
  try {
    const file = path.join(SESSIONS_DIR, `${sid}.json`);
    await fs.rm(file, { force: true });
  } catch { /* ignore */ }
}

/** 删除用户的所有会话 */
export async function deleteUserSessions(uid: number): Promise<void> {
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(SESSIONS_DIR, f), 'utf-8');
        const session = JSON.parse(raw) as Session;
        if (session.uid === uid) {
          await fs.rm(path.join(SESSIONS_DIR, f), { force: true });
        }
      } catch { /* skip corrupt */ }
    }
  } catch { /* dir may not exist */ }
}

/** 清理过期会话 */
export async function cleanExpiredSessions(): Promise<number> {
  const now = Date.now();
  let cleaned = 0;
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const filePath = path.join(SESSIONS_DIR, f);
        const raw = await fs.readFile(filePath, 'utf-8');
        const session = JSON.parse(raw) as Session;
        if (session.expiresAt < now) {
          await fs.rm(filePath, { force: true });
          cleaned++;
        }
      } catch { /* skip */ }
    }
  } catch { /* dir may not exist */ }
  return cleaned;
}
