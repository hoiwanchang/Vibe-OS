/**
 * auth 模块单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$hashed'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

const mockLoadUsers = vi.fn().mockResolvedValue([]);
const mockSaveUsers = vi.fn().mockResolvedValue(undefined);
const mockFindUserByUsername = vi.fn().mockResolvedValue(null);
const mockFindUserByUid = vi.fn().mockResolvedValue(null);
const mockAddUser = vi.fn().mockResolvedValue(undefined);
const mockUpdateUser = vi.fn().mockResolvedValue(undefined);
const mockDeleteUser = vi.fn().mockResolvedValue(undefined);
const mockSaveSession = vi.fn().mockResolvedValue(undefined);
const mockLoadSession = vi.fn().mockResolvedValue(null);
const mockDeleteSession = vi.fn().mockResolvedValue(undefined);
const mockDeleteUserSessions = vi.fn().mockResolvedValue(undefined);
const mockEnsureAuthDirs = vi.fn().mockResolvedValue(undefined);

vi.mock('../auth.dao.js', () => ({
  loadUsers: (...a: unknown[]) => mockLoadUsers(...a),
  saveUsers: (...a: unknown[]) => mockSaveUsers(...a),
  findUserByUsername: (...a: unknown[]) => mockFindUserByUsername(...a),
  findUserByUid: (...a: unknown[]) => mockFindUserByUid(...a),
  addUser: (...a: unknown[]) => mockAddUser(...a),
  updateUser: (...a: unknown[]) => mockUpdateUser(...a),
  deleteUser: (...a: unknown[]) => mockDeleteUser(...a),
  saveSession: (...a: unknown[]) => mockSaveSession(...a),
  loadSession: (...a: unknown[]) => mockLoadSession(...a),
  deleteSession: (...a: unknown[]) => mockDeleteSession(...a),
  deleteUserSessions: (...a: unknown[]) => mockDeleteUserSessions(...a),
  ensureAuthDirs: (...a: unknown[]) => mockEnsureAuthDirs(...a),
}));

vi.mock('../../../config.js', () => ({
  ADMIN_PASSWORD: 'vibeos',
  LOGIN_LOCK_MS: 900000,
  LOGIN_MAX_ATTEMPTS: 5,
  SESSION_TTL_MS: 86400000,
  VIBEOS_APP_DIR: '/tmp/vibeos-data/vibeos',
  FORCE_2FA: false,
}));

import * as service from '../auth.service.js';
import bcrypt from 'bcrypt';

const mockUser = {
  uid: 1000, username: 'admin', passwordHash: '$2b$12$hashed',
  role: 'admin' as const, mustChangePassword: true,
  createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
};

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service._loginAttempts.clear();
  });

  describe('initAuth', () => {
    it('用户为空时应创建 admin', async () => {
      mockLoadUsers.mockResolvedValue([]);
      await service.initAuth();
      expect(mockAddUser).toHaveBeenCalledTimes(1);
      const arg = mockAddUser.mock.calls[0][0];
      expect(arg.username).toBe('admin');
      expect(arg.role).toBe('admin');
      expect(arg.mustChangePassword).toBe(true);
    });

    it('已有用户时不应重复创建', async () => {
      mockLoadUsers.mockResolvedValue([mockUser]);
      await service.initAuth();
      expect(mockAddUser).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('正确凭据应返回用户和会话', async () => {
      mockFindUserByUsername.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      const result = await service.login('admin', 'vibeos', '127.0.0.1');
      expect(result.require2fa).toBe(false);
      if (!result.require2fa) {
        expect(result.user.username).toBe('admin');
        expect(result.session.sid).toBeDefined();
      }
      expect(mockSaveSession).toHaveBeenCalled();
    });

    it('用户不存在应 401', async () => {
      mockFindUserByUsername.mockResolvedValue(null);
      await expect(service.login('nobody', 'x', '127.0.0.1')).rejects.toThrow('用户名或密码错误');
    });

    it('密码错误应 401', async () => {
      mockFindUserByUsername.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);
      await expect(service.login('admin', 'wrong', '127.0.0.1')).rejects.toThrow('用户名或密码错误');
    });

    it('5 次失败后应锁定', async () => {
      mockFindUserByUsername.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);
      for (let i = 0; i < 5; i++) {
        await expect(service.login('admin', 'wrong', '1.2.3.4')).rejects.toThrow();
      }
      await expect(service.login('admin', 'vibeos', '1.2.3.4')).rejects.toThrow('账号已锁定');
    });

    it('锁定后不同 IP 不受影响', async () => {
      mockFindUserByUsername.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);
      for (let i = 0; i < 5; i++) {
        await expect(service.login('admin', 'wrong', '1.1.1.1')).rejects.toThrow();
      }
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      const result = await service.login('admin', 'vibeos', '2.2.2.2');
      expect(result.require2fa).toBe(false);
      if (!result.require2fa) {
        expect(result.user.username).toBe('admin');
      }
    });
  });

  describe('logout', () => {
    it('应删除会话', async () => {
      await service.logout('sid-123');
      expect(mockDeleteSession).toHaveBeenCalledWith('sid-123');
    });
  });

  describe('validateSession', () => {
    it('有效会话应返回', async () => {
      const session = { sid: 's1', uid: 1000, username: 'admin', role: 'admin', createdAt: Date.now(), expiresAt: Date.now() + 99999 };
      mockLoadSession.mockResolvedValue(session);
      const result = await service.validateSession('s1');
      expect(result?.sid).toBe('s1');
    });

    it('过期会话应返回 null 并删除', async () => {
      const session = { sid: 's1', uid: 1000, username: 'admin', role: 'admin', createdAt: Date.now() - 99999, expiresAt: Date.now() - 1 };
      mockLoadSession.mockResolvedValue(session);
      const result = await service.validateSession('s1');
      expect(result).toBeNull();
      expect(mockDeleteSession).toHaveBeenCalledWith('s1');
    });

    it('不存在会话应返回 null', async () => {
      mockLoadSession.mockResolvedValue(null);
      expect(await service.validateSession('nope')).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('存在应返回', async () => {
      mockFindUserByUid.mockResolvedValue(mockUser);
      const u = await service.getCurrentUser(1000);
      expect(u.username).toBe('admin');
    });

    it('不存在应 404', async () => {
      mockFindUserByUid.mockResolvedValue(null);
      await expect(service.getCurrentUser(9999)).rejects.toThrow();
    });
  });

  describe('changePassword', () => {
    it('正确旧密码应更新', async () => {
      mockFindUserByUid.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      await service.changePassword(1000, { currentPassword: 'old', newPassword: 'newpass123' });
      expect(mockUpdateUser).toHaveBeenCalled();
      expect(mockDeleteUserSessions).toHaveBeenCalledWith(1000);
    });

    it('旧密码错误应 400', async () => {
      mockFindUserByUid.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);
      await expect(service.changePassword(1000, { currentPassword: 'x', newPassword: 'y' })).rejects.toThrow('当前密码错误');
    });

    it('新密码太短应 400', async () => {
      mockFindUserByUid.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      await expect(service.changePassword(1000, { currentPassword: 'old', newPassword: '123' })).rejects.toThrow('至少 6 位');
    });
  });

  describe('registerUser', () => {
    it('应创建用户', async () => {
      mockFindUserByUsername.mockResolvedValue(null);
      const u = await service.registerUser(1001, 'test', 'pass123');
      expect(u.username).toBe('test');
      expect(mockAddUser).toHaveBeenCalled();
    });

    it('重复用户名应 409', async () => {
      mockFindUserByUsername.mockResolvedValue(mockUser);
      await expect(service.registerUser(1001, 'admin', 'x')).rejects.toThrow('已存在');
    });
  });

  describe('removeUser', () => {
    it('应删除用户和会话', async () => {
      await service.removeUser(1001);
      expect(mockDeleteUser).toHaveBeenCalledWith(1001);
      expect(mockDeleteUserSessions).toHaveBeenCalledWith(1001);
    });
  });
});
