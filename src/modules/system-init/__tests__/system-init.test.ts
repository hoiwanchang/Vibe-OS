/**
 * 模块1：系统初始化 — 单元测试
 * Mock 系统层，测试 service/dao/controller 逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 系统层
vi.mock('../../../system/filesystem.js', () => ({
  assertSafePath: vi.fn((p: string) => {
    if (p.includes('..')) throw new Error('路径穿越');
    return p;
  }),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  pathExists: vi.fn().mockResolvedValue(false),
  getDirUsageBytes: vi.fn().mockResolvedValue(1024n * 1024n * 500n),
  getQuotaInfo: vi.fn().mockResolvedValue({
    usedBytes: 524288000n,
    quotaBytes: 107374182400n,
  }),
  setUserQuota: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn().mockResolvedValue({
    stdout: 'naisys\n',
    stderr: '',
    exitCode: 0,
  }),
  executeCommandStrict: vi.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  }),
}));

vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  SECRETS_DIR: '/data/naisys/secrets',
  SYSTEM_CACHE_DIR: '/data/naisys/cache',
  USER_SUBDIRS: ['files', 'config', 'cache'],
  APP_SUBDIRS: ['models', 'data', 'logs'],
  DEFAULT_QUOTA_BYTES: 107374182400n,
  PORT: 3000,
  HOST: '127.0.0.1',
  API_TOKEN: '',
  COMMAND_TIMEOUT_MS: 30000,
}));

import * as service from '../system-init.service.js';
import * as dao from '../system-init.dao.js';
import { AppError } from '../../../common/app-error.js';

describe('模块1：系统初始化', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initializeDataDirs', () => {
    it('应成功创建核心目录结构', async () => {
      const result = await service.initializeDataDirs({});
      expect(result.success).toBe(true);
      expect(result.dataRoot).toBe('/data');
      expect(result.createdDirs.length).toBeGreaterThan(0);
    });

    it('已存在的目录应归入 existingDirs', async () => {
      const { pathExists } = await import('../../../system/filesystem.js');
      vi.mocked(pathExists).mockResolvedValue(true);

      const result = await service.initializeDataDirs({});
      expect(result.existingDirs.length).toBeGreaterThan(0);
      expect(result.createdDirs.length).toBe(0);
    });

    it('以 root 运行时应抛出 FORBIDDEN 错误', async () => {
      // 模拟 root 用户
      const originalGetuid = process.getuid;
      process.getuid = () => 0;

      await expect(service.initializeDataDirs({})).rejects.toThrow(AppError);

      process.getuid = originalGetuid;
    });
  });

  describe('getUserQuota', () => {
    it('应返回用户配额信息', async () => {
      const { pathExists } = await import('../../../system/filesystem.js');
      vi.mocked(pathExists).mockResolvedValue(true);

      const { executeCommand } = await import('../../../system/command-executor.js');
      vi.mocked(executeCommand).mockImplementation(async (cmd: string, _args?: string[]) => {
        if (cmd === 'getent') {
          return { stdout: 'testuser:x:1000:1000::/home/testuser:/bin/bash\n', stderr: '', exitCode: 0 };
        }
        if (cmd === 'du') {
          return { stdout: '524288000\t/data/1000/files\n', stderr: '', exitCode: 0 };
        }
        if (cmd === 'quota') {
          return { stdout: '/data 512000 104857600 0 0\n', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const result = await service.getUserQuota(1000);
      expect(result.uid).toBe(1000);
      expect(result.dataDir).toBe('/data/1000');
      expect(result.subdirs).toHaveLength(3);
    });

    it('用户不存在时应抛出 NOT_FOUND', async () => {
      const { executeCommand } = await import('../../../system/command-executor.js');
      vi.mocked(executeCommand).mockResolvedValue({
        stdout: '',
        stderr: 'not found',
        exitCode: 2,
      });

      await expect(service.getUserQuota(9999)).rejects.toThrow(AppError);
    });
  });

  describe('DAO: createUserDirs', () => {
    it('应创建用户目录及子目录', async () => {
      const { pathExists } = await import('../../../system/filesystem.js');
      vi.mocked(pathExists).mockResolvedValue(false);

      const created = await dao.createUserDirs(1000);
      expect(created.length).toBe(4); // 根 + 3 子目录
    });
  });

  describe('DAO: checkPermissions', () => {
    it('应返回权限校验结果', async () => {
      const result = await dao.checkPermissions();
      expect(result).toHaveProperty('dataRootWritable');
      expect(result).toHaveProperty('secretsDirSecure');
      expect(result).toHaveProperty('currentUser');
      expect(result).toHaveProperty('isRoot');
    });
  });

  describe('DAO: getRequiredDirs', () => {
    it('应返回所有必须目录', () => {
      const dirs = dao.getRequiredDirs();
      expect(dirs).toContain('/data');
      expect(dirs).toContain('/data/naisys');
      expect(dirs).toContain('/data/naisys/secrets');
      expect(dirs).toContain('/data/naisys/cache');
    });
  });
});
