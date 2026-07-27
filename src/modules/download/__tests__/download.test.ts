/**
 * 模块：下载中心 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../download.service.js';
import { AppError } from '../../../common/app-error.js';

function rpcResponse(result: unknown) {
  return { json: () => Promise.resolve({ result }) };
}

describe('下载中心', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('listTasks', () => {
    it('应合并 active/waiting/stopped', async () => {
      mockFetch
        .mockResolvedValueOnce(rpcResponse([{ gid: 'a1', status: 'active', totalLength: '1000', completedLength: '500', downloadSpeed: '100', uploadSpeed: '0', connections: '2', dir: '/data', files: [] }]))
        .mockResolvedValueOnce(rpcResponse([{ gid: 'w1', status: 'waiting', totalLength: '2000', completedLength: '0', downloadSpeed: '0', uploadSpeed: '0', connections: '0', dir: '/data', files: [] }]))
        .mockResolvedValueOnce(rpcResponse([]));
      const tasks = await service.listTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks[0]?.gid).toBe('a1');
      expect(tasks[0]?.progress).toBe(50);
    });

    it('aria2 不可达应抛 503', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.listTasks()).rejects.toThrow(AppError);
    });
  });

  describe('addTask', () => {
    it('应返回 gid', async () => {
      mockFetch.mockResolvedValue(rpcResponse('abc123'));
      const gids = await service.addTask(['https://example.com/file.zip']);
      expect(gids).toEqual(['abc123']);
    });
  });

  describe('pauseTask / resumeTask', () => {
    it('暂停应返回 gid', async () => {
      mockFetch.mockResolvedValue(rpcResponse('abc123'));
      const gid = await service.pauseTask('abc123');
      expect(gid).toBe('abc123');
    });

    it('恢复应返回 gid', async () => {
      mockFetch.mockResolvedValue(rpcResponse('abc123'));
      const gid = await service.resumeTask('abc123');
      expect(gid).toBe('abc123');
    });
  });

  describe('getSettings / updateSettings', () => {
    it('应获取全局设置', async () => {
      mockFetch.mockResolvedValue(rpcResponse({ 'max-overall-download-limit': '0' }));
      const settings = await service.getSettings();
      expect(settings['max-overall-download-limit']).toBe('0');
    });

    it('应更新设置', async () => {
      mockFetch.mockResolvedValue(rpcResponse({}));
      const updated = await service.updateSettings({ 'max-overall-download-limit': '1M' });
      expect(updated).toContain('max-overall-download-limit');
    });
  });
});
