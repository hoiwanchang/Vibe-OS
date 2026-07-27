/**
 * 模块：计划任务 — 单元测试
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
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
}));
vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../scheduler.service.js';
import { AppError } from '../../../common/app-error.js';

describe('计划任务', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('createJob', () => {
    it('应创建任务', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const job = await service.createJob({ name: 'cleanup', command: 'echo hello', schedule: '0 3 * * *' });
      expect(job.name).toBe('cleanup');
      expect(job.enabled).toBe(true);
    });

    it('危险命令应被拒绝', async () => {
      await expect(service.createJob({ name: 'bad', command: 'rm -rf /', schedule: '* * * * *' })).rejects.toThrow(AppError);
    });

    it('mkfs 命令应被拒绝', async () => {
      await expect(service.createJob({ name: 'bad', command: 'mkfs.ext4 /dev/sda', schedule: '* * * * *' })).rejects.toThrow(AppError);
    });

    it('dd 命令应被拒绝', async () => {
      await expect(service.createJob({ name: 'bad', command: 'dd if=/dev/zero of=/dev/sda', schedule: '* * * * *' })).rejects.toThrow(AppError);
    });
  });

  describe('runJob', () => {
    it('成功执行应返回 success', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('jobs.json')) return Promise.resolve(JSON.stringify([{ id: 'j1', name: 'test', command: 'echo ok', schedule: '* * * * *', enabled: true, lastRun: null, lastStatus: null, nextRun: null }]));
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: 'ok\n', stderr: '' });
      const exec = await service.runJob('j1');
      expect(exec.status).toBe('success');
      expect(exec.exitCode).toBe(0);
    });

    it('失败执行应返回 failed', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('jobs.json')) return Promise.resolve(JSON.stringify([{ id: 'j1', name: 'test', command: 'exit 1', schedule: '* * * * *', enabled: true, lastRun: null, lastStatus: null, nextRun: null }]));
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });
      const exec = await service.runJob('j1');
      expect(exec.status).toBe('failed');
    });
  });

  describe('updateJob', () => {
    it('应更新任务', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'j1', name: 'old', command: 'echo 1', schedule: '0 * * * *', enabled: true, lastRun: null, lastStatus: null, nextRun: null }]));
      const job = await service.updateJob('j1', { name: 'new', enabled: false });
      expect(job.name).toBe('new');
      expect(job.enabled).toBe(false);
    });

    it('不存在应 404', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));
      await expect(service.updateJob('nope', { name: 'x' })).rejects.toThrow(AppError);
    });
  });

  describe('deleteJob', () => {
    it('应删除任务', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'j1', name: 'test', command: 'echo', schedule: '* * * * *', enabled: true, lastRun: null, lastStatus: null, nextRun: null }]));
      const removed = await service.deleteJob('j1');
      expect(removed).toBe('j1');
    });
  });

  describe('getHistory', () => {
    it('应返回执行历史', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'e1', jobId: 'j1', status: 'success' }]));
      const history = await service.getHistory('j1', 20);
      expect(history).toHaveLength(1);
    });
  });
});
