/**
 * 系统层：filesystem 单元测试
 * Mock node:fs/promises 和 command-executor
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockAccess = vi.fn().mockResolvedValue(undefined);
const mockStat = vi.fn().mockResolvedValue({ mode: 0o700 });
vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  access: (...args: unknown[]) => mockAccess(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  writeFile: vi.fn().mockResolvedValue(undefined),
  constants: { W_OK: 2 },
}));

vi.mock('../../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  SECRETS_DIR: '/data/naisys/secrets',
  SYSTEM_CACHE_DIR: '/data/naisys/cache',
  COMMAND_TIMEOUT_MS: 5000,
}));

// Mock command-executor（filesystem 内部动态 import 使用）
vi.mock('../command-executor.js', () => ({
  executeCommand: vi.fn().mockResolvedValue({ stdout: '1024\t/data\n', stderr: '', exitCode: 0 }),
  executeCommandStrict: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

import { assertSafePath, ensureDir, pathExists } from '../filesystem.js';

describe('filesystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('assertSafePath', () => {
    it('应允许 /data/ 内的路径', () => {
      expect(assertSafePath('/data/1000/files')).toBe('/data/1000/files');
    });

    it('应允许 /data 本身', () => {
      expect(assertSafePath('/data')).toBe('/data');
    });

    it('应拒绝路径穿越', () => {
      expect(() => assertSafePath('/data/../etc/passwd')).toThrow('路径穿越');
    });

    it('应拒绝 /data 外的路径', () => {
      expect(() => assertSafePath('/etc/shadow')).toThrow('路径穿越');
    });

    it('应拒绝 /tmp 路径', () => {
      expect(() => assertSafePath('/tmp/evil')).toThrow('路径穿越');
    });
  });

  describe('ensureDir', () => {
    it('应创建目录', async () => {
      await ensureDir('/data/naisys/test', 0o755);
      expect(mockMkdir).toHaveBeenCalledWith('/data/naisys/test', { recursive: true, mode: 0o755 });
    });

    it('应拒绝 /data 外的目录', async () => {
      await expect(ensureDir('/etc/evil')).rejects.toThrow('路径穿越');
    });
  });

  describe('pathExists', () => {
    it('路径存在应返回 true', async () => {
      mockAccess.mockResolvedValue(undefined);
      expect(await pathExists('/data/1000')).toBe(true);
    });

    it('路径不存在应返回 false', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      expect(await pathExists('/data/9999')).toBe(false);
    });
  });
});
