/**
 * 系统层：command-executor 单元测试
 * Mock node:child_process 测试命令执行逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

vi.mock('../../config.js', () => ({
  COMMAND_TIMEOUT_MS: 5000,
}));

import { executeCommand, executeCommandStrict } from '../command-executor.js';

describe('command-executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeCommand', () => {
    it('应拒绝白名单外的命令', async () => {
      await expect(executeCommand('mkfs', ['-t', 'ext4', '/dev/sda'])).rejects.toThrow('不在允许列表中');
    });

    it('应成功执行白名单内的命令', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, 'output\n', '');
      });

      const result = await executeCommand('smartctl', ['-H', '/dev/sda']);
      expect(result.stdout).toBe('output\n');
      expect(result.exitCode).toBe(0);
    });

    it('命令失败时应返回非零退出码', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        const err = new Error('command failed') as Error & { code?: number };
        err.code = 1;
        cb(err, '', 'error output');
      });

      const result = await executeCommand('smartctl', ['-H', '/dev/sda']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('error output');
    });

    it('超时应抛出错误', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        const err = new Error('timeout') as Error & { killed?: boolean };
        err.killed = true;
        cb(err, '', '');
      });

      await expect(executeCommand('docker', ['ps'])).rejects.toThrow('超时');
    });

    it('error 为 null 时退出码应为 0', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, 'ok', '');
      });

      const result = await executeCommand('id', ['-un']);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('executeCommandStrict', () => {
    it('非零退出码应抛出错误', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        const err = new Error('fail') as Error & { code?: number };
        err.code = 2;
        cb(err, '', 'not found');
      });

      await expect(executeCommandStrict('getent', ['passwd', '9999'])).rejects.toThrow('命令执行失败');
    });

    it('成功时应返回结果', async () => {
      mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, 'user:x:1000:1000\n', '');
      });

      const result = await executeCommandStrict('getent', ['passwd', '1000']);
      expect(result.stdout).toContain('user');
    });
  });
});
