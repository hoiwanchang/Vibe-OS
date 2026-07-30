/**
 * 模块：备份与快照 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn().mockResolvedValue(undefined);
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));
const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));
vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../backup.service.js';
import { AppError } from '../../../common/app-error.js';

describe('备份与快照', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('createJob', () => {
    it('应创建备份任务', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const job = await service.createJob({ name: 'daily', source: '/data/1000', target: '/backup/1000', type: 'rsync' });
      expect(job.name).toBe('daily');
      expect(job.id).toBeTruthy();
      expect(job.enabled).toBe(true);
    });
  });

  describe('runJob', () => {
    it('rsync 成功应记录统计', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('jobs.json')) return Promise.resolve(JSON.stringify([{ id: 'j1', name: 'test', source: '/data/1', target: '/bak', type: 'rsync', schedule: null, enabled: true, lastRun: null, lastStatus: null }]));
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommandStrict.mockResolvedValue({
        exitCode: 0,
        stdout: 'Number of regular files transferred: 42\nTotal transferred file size: 1,024,000',
        stderr: '',
      });
      const exec = await service.runJob('j1');
      expect(exec.status).toBe('success');
      expect(exec.filesTransferred).toBe(42);
    });

    it('任务不存在应 404', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      await expect(service.runJob('nope')).rejects.toThrow(AppError);
    });
  });

  describe('deleteJob', () => {
    it('应删除任务', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'j1', name: 'test', source: '/a', target: '/b', type: 'rsync', schedule: null, enabled: true, lastRun: null, lastStatus: null }]));
      const removed = await service.deleteJob('j1');
      expect(removed).toBe('j1');
    });
  });

  describe('createSnapshot', () => {
    it('btrfs 快照成功', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const snap = await service.createSnapshot('pool1', 'snap1');
      expect(snap.name).toBe('snap1');
    });

    it('不支持的文件系统应报错', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'not supported' });
      await expect(service.createSnapshot('pool1', 'snap1')).rejects.toThrow(AppError);
    });
  });
});
