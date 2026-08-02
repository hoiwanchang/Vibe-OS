/**
 * 2FA / TOTP 模块单元测试
 * 覆盖 setup / verify / disable / backup-codes / login 流程
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== Mocks =====

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$10$hashed-backup'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

const mockFindUserByUid = vi.fn().mockResolvedValue(null);
const mockFindUserByUsername = vi.fn().mockResolvedValue(null);
const mockSaveSession = vi.fn().mockResolvedValue(undefined);

vi.mock('../auth.dao.js', () => ({
  findUserByUid: (...a: unknown[]) => mockFindUserByUid(...a),
  findUserByUsername: (...a: unknown[]) => mockFindUserByUsername(...a),
  saveSession: (...a: unknown[]) => mockSaveSession(...a),
  loadUsers: vi.fn().mockResolvedValue([]),
  saveUsers: vi.fn().mockResolvedValue(undefined),
  addUser: vi.fn().mockResolvedValue(undefined),
  updateUser: vi.fn().mockResolvedValue(undefined),
  deleteUser: vi.fn().mockResolvedValue(undefined),
  loadSession: vi.fn().mockResolvedValue(null),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  deleteUserSessions: vi.fn().mockResolvedValue(undefined),
  ensureAuthDirs: vi.fn().mockResolvedValue(undefined),
}));

// 内存文件系统模拟
const memFiles = new Map<string, string>();

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async (p: string) => {
    const content = memFiles.get(p);
    if (content === undefined) {
      const err = new Error(`ENOENT: ${p}`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    return content;
  }),
  writeFile: vi.fn(async (p: string, data: string) => {
    memFiles.set(p, data);
  }),
  rm: vi.fn(async (p: string) => {
    memFiles.delete(p);
  }),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  realpath: vi.fn(async (p: string) => p),
}));

vi.mock('../../../config.js', () => ({
  VIBEOS_APP_DIR: '/tmp/vibeos-test/vibeos',
  FORCE_2FA: false,
  SESSION_TTL_MS: 86400000,
  ADMIN_PASSWORD: 'vibeos',
  LOGIN_LOCK_MS: 900000,
  LOGIN_MAX_ATTEMPTS: 5,
  SESSION_COOKIE_NAME: 'vibeos.sid',
  IS_PRODUCTION: false,
}));

vi.mock('../../../system/filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,FAKE_QR'),
  },
}));

// otpauth mock — 使用可控的 validate 结果
let mockValidateResult: number | null = 0;
vi.mock('otpauth', () => {
  class MockSecret {
    base32 = 'JBSWY3DPEHPK3PXP';
    static fromBase32(_s: string) { return new MockSecret(); }
    constructor(_opts?: unknown) {}
  }
  class MockTOTP {
    constructor(_opts?: unknown) {}
    toString() { return 'otpauth://totp/VibeOS:testuser?secret=JBSWY3DPEHPK3PXP&issuer=VibeOS&algorithm=SHA1&digits=6&period=30'; }
    validate(_opts: { token: string; window: number }) { return mockValidateResult; }
  }
  return {
    Secret: MockSecret,
    TOTP: MockTOTP,
  };
});

import * as twoFactor from '../two-factor.service.js';
import bcrypt from 'bcrypt';

const mockUser = {
  uid: 1000,
  username: 'admin',
  passwordHash: '$2b$12$hashed',
  role: 'admin' as const,
  mustChangePassword: false,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const TWO_FA_DIR = '/tmp/vibeos-test/vibeos/auth/2fa';

describe('two-factor.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memFiles.clear();
    twoFactor._pending2FATokens.clear();
    mockValidateResult = 0; // TOTP 验证成功
  });

  // ===== setup =====
  describe('setup', () => {
    it('应返回 secret、uri 和 qrDataUri', async () => {
      const result = await twoFactor.setup(1000, 'admin');
      expect(result.secret).toBeDefined();
      expect(result.uri).toContain('otpauth://totp/');
      expect(result.qrDataUri).toContain('data:image/png');
    });

    it('应将配置写入文件（enabled=false）', async () => {
      await twoFactor.setup(1000, 'admin');
      const raw = memFiles.get(`${TWO_FA_DIR}/1000.json`);
      expect(raw).toBeDefined();
      const config = JSON.parse(raw!);
      expect(config.uid).toBe(1000);
      expect(config.enabled).toBe(false);
      expect(config.secret).toBeDefined();
    });

    it('已有配置时保留 enabled 状态', async () => {
      // 先写入一个已启用的配置
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'OLD', enabled: true,
        backupCodes: [], createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      await twoFactor.setup(1000, 'admin');
      const config = JSON.parse(memFiles.get(`${TWO_FA_DIR}/1000.json`)!);
      expect(config.enabled).toBe(true);
    });
  });

  // ===== verify =====
  describe('verify', () => {
    it('未 setup 时应 400', async () => {
      await expect(twoFactor.verify(1000, '123456')).rejects.toThrow('请先执行 2FA setup');
    });

    it('TOTP 码错误时应 401', async () => {
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'JBSWY3DPEHPK3PXP', enabled: false,
        backupCodes: [], createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      mockValidateResult = null; // 验证失败
      await expect(twoFactor.verify(1000, '000000')).rejects.toThrow('验证码错误');
    });

    it('验证成功应启用 2FA 并返回 10 个备用码', async () => {
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'JBSWY3DPEHPK3PXP', enabled: false,
        backupCodes: [], createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      const result = await twoFactor.verify(1000, '123456');
      expect(result.backupCodes).toHaveLength(10);
      // 每个备用码格式 xxxxx-xxxxx
      for (const code of result.backupCodes) {
        expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
      }
      // 配置已启用
      const config = JSON.parse(memFiles.get(`${TWO_FA_DIR}/1000.json`)!);
      expect(config.enabled).toBe(true);
      expect(config.backupCodes).toHaveLength(10);
      expect(config.plainBackupCodes).toHaveLength(10);
    });
  });

  // ===== disable =====
  describe('disable', () => {
    it('用户不存在应 404', async () => {
      mockFindUserByUid.mockResolvedValue(null);
      await expect(twoFactor.disable(9999, 'pass')).rejects.toThrow('不存在');
    });

    it('密码错误应 400', async () => {
      mockFindUserByUid.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(false);
      await expect(twoFactor.disable(1000, 'wrong')).rejects.toThrow('密码错误');
    });

    it('密码正确应删除配置', async () => {
      mockFindUserByUid.mockResolvedValue(mockUser);
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      memFiles.set(`${TWO_FA_DIR}/1000.json`, '{}');
      await twoFactor.disable(1000, 'correct');
      expect(memFiles.has(`${TWO_FA_DIR}/1000.json`)).toBe(false);
    });
  });

  // ===== backup-codes =====
  describe('getBackupCodes', () => {
    it('2FA 未启用应 400', async () => {
      await expect(twoFactor.getBackupCodes(1000)).rejects.toThrow('2FA 未启用');
    });

    it('首次查看应返回明文并清空', async () => {
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'S', enabled: true,
        backupCodes: [{ hash: '$2b$10$h', used: false }],
        plainBackupCodes: ['aaaaa-bbbbb', 'ccccc-ddddd'],
        createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      const result = await twoFactor.getBackupCodes(1000);
      expect(result.codes).toEqual(['aaaaa-bbbbb', 'ccccc-ddddd']);
      // 再次查看应返回 null
      const result2 = await twoFactor.getBackupCodes(1000);
      expect(result2.codes).toBeNull();
    });

    it('已查看过应返回 null', async () => {
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'S', enabled: true,
        backupCodes: [], plainBackupCodes: [],
        createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      const result = await twoFactor.getBackupCodes(1000);
      expect(result.codes).toBeNull();
    });
  });

  // ===== regenerate =====
  describe('regenerateBackupCodes', () => {
    it('2FA 未启用应 400', async () => {
      await expect(twoFactor.regenerateBackupCodes(1000, '123456')).rejects.toThrow('2FA 未启用');
    });

    it('TOTP 码错误应 401', async () => {
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'S', enabled: true,
        backupCodes: [], createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      mockValidateResult = null;
      await expect(twoFactor.regenerateBackupCodes(1000, '000000')).rejects.toThrow('验证码错误');
    });

    it('成功应返回 10 个新备用码', async () => {
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'S', enabled: true,
        backupCodes: [{ hash: 'old', used: false }],
        createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      const result = await twoFactor.regenerateBackupCodes(1000, '123456');
      expect(result.backupCodes).toHaveLength(10);
      const config = JSON.parse(memFiles.get(`${TWO_FA_DIR}/1000.json`)!);
      expect(config.backupCodes).toHaveLength(10);
    });
  });

  // ===== 登录流程 =====
  describe('2FA login flow', () => {
    it('createPending2FAToken 应返回 pending-2fa- 前缀令牌', () => {
      const token = twoFactor.createPending2FAToken(1000, 'admin', '127.0.0.1');
      expect(token).toMatch(/^pending-2fa-/);
    });

    it('consumePending2FAToken 有效令牌应返回并删除', () => {
      const token = twoFactor.createPending2FAToken(1000, 'admin', '127.0.0.1');
      const pending = twoFactor.consumePending2FAToken(token);
      expect(pending).not.toBeNull();
      expect(pending!.uid).toBe(1000);
      // 再次消费应返回 null
      expect(twoFactor.consumePending2FAToken(token)).toBeNull();
    });

    it('无效令牌应返回 null', () => {
      expect(twoFactor.consumePending2FAToken('invalid')).toBeNull();
    });

    it('过期令牌应返回 null', () => {
      const token = twoFactor.createPending2FAToken(1000, 'admin', '127.0.0.1');
      // 手动设置过期
      const pending = twoFactor._pending2FATokens.get(token)!;
      pending.expiresAt = Date.now() - 1000;
      expect(twoFactor.consumePending2FAToken(token)).toBeNull();
    });

    it('verify2FALogin 无效令牌应 401', async () => {
      await expect(twoFactor.verify2FALogin('bad-token', '123456')).rejects.toThrow('令牌无效');
    });

    it('verify2FALogin TOTP 成功应创建会话', async () => {
      const token = twoFactor.createPending2FAToken(1000, 'admin', '127.0.0.1');
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'S', enabled: true,
        backupCodes: [], createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      mockFindUserByUid.mockResolvedValue(mockUser);
      const result = await twoFactor.verify2FALogin(token, '123456');
      expect(result.user.username).toBe('admin');
      expect(result.session.sid).toBeDefined();
      expect(mockSaveSession).toHaveBeenCalled();
    });

    it('verify2FALogin 备用码成功应标记已使用', async () => {
      const token = twoFactor.createPending2FAToken(1000, 'admin', '127.0.0.1');
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'S', enabled: true,
        backupCodes: [
          { hash: '$2b$10$backup1', used: false },
          { hash: '$2b$10$backup2', used: false },
        ],
        createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      mockFindUserByUid.mockResolvedValue(mockUser);
      // TOTP 失败，备用码成功
      mockValidateResult = null;
      vi.mocked(bcrypt.compare).mockResolvedValue(true);
      const result = await twoFactor.verify2FALogin(token, 'aaaaa-bbbbb');
      expect(result.user.username).toBe('admin');
      // 第一个备用码应被标记为已使用
      const config = JSON.parse(memFiles.get(`${TWO_FA_DIR}/1000.json`)!);
      expect(config.backupCodes[0].used).toBe(true);
      expect(config.backupCodes[1].used).toBe(false);
    });

    it('verify2FALogin TOTP 和备用码都失败应 401', async () => {
      const token = twoFactor.createPending2FAToken(1000, 'admin', '127.0.0.1');
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'S', enabled: true,
        backupCodes: [{ hash: '$2b$10$x', used: false }],
        createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      mockValidateResult = null;
      vi.mocked(bcrypt.compare).mockResolvedValue(false);
      await expect(twoFactor.verify2FALogin(token, 'wrong')).rejects.toThrow('验证码错误');
    });
  });

  // ===== is2FARequired =====
  describe('is2FARequired', () => {
    it('用户已启用 2FA 应返回 true', async () => {
      memFiles.set(`${TWO_FA_DIR}/1000.json`, JSON.stringify({
        uid: 1000, secret: 'S', enabled: true,
        backupCodes: [], createdAt: '2025-01-01', updatedAt: '2025-01-01',
      }));
      expect(await twoFactor.is2FARequired(1000)).toBe(true);
    });

    it('用户未启用且无全局强制应返回 false', async () => {
      expect(await twoFactor.is2FARequired(1000)).toBe(false);
    });

    it('全局 force2fa 应返回 true', async () => {
      memFiles.set(`${TWO_FA_DIR}/global.json`, JSON.stringify({ force2fa: true }));
      expect(await twoFactor.is2FARequired(1000)).toBe(true);
    });
  });

  // ===== 全局配置 =====
  describe('global config', () => {
    it('setForce2FA 应写入 global.json', async () => {
      await twoFactor.setForce2FA(true);
      const raw = memFiles.get(`${TWO_FA_DIR}/global.json`);
      expect(raw).toBeDefined();
      expect(JSON.parse(raw!).force2fa).toBe(true);
    });

    it('getGlobalConfig 无文件时应回退到 FORCE_2FA 环境变量', async () => {
      const config = await twoFactor.getGlobalConfig();
      expect(config.force2fa).toBe(false);
    });
  });
});