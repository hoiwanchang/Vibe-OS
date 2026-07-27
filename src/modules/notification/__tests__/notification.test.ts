/**
 * 模块：通知与告警 — 单元测试
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
vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../notification.service.js';
import { AppError } from '../../../common/app-error.js';

describe('通知与告警', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('emit', () => {
    it('应创建通知', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const n = await service.emit('warning', 'disk', '磁盘告警', 'sda 温度过高', 'hardware');
      expect(n.severity).toBe('warning');
      expect(n.read).toBe(false);
      expect(n.id).toBeTruthy();
    });
  });

  describe('list', () => {
    it('应支持分页和过滤', async () => {
      const items = [
        { id: '1', severity: 'info', category: 'system', title: 'a', detail: '', source: '', read: false, createdAt: '' },
        { id: '2', severity: 'critical', category: 'disk', title: 'b', detail: '', source: '', read: true, createdAt: '' },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(items));
      const result = await service.list(10, 0, 'critical');
      expect(result.total).toBe(1);
      expect(result.notifications[0]?.id).toBe('2');
    });
  });

  describe('markRead', () => {
    it('应标记已读', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: '1', severity: 'info', category: 'system', title: 'a', detail: '', source: '', read: false, createdAt: '' }]));
      const id = await service.markRead('1');
      expect(id).toBe('1');
    });

    it('不存在应 404', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));
      await expect(service.markRead('nope')).rejects.toThrow(AppError);
    });
  });

  describe('unreadCount', () => {
    it('应返回未读数', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([
        { id: '1', read: false }, { id: '2', read: true }, { id: '3', read: false },
      ]));
      const count = await service.unreadCount();
      expect(count).toBe(2);
    });
  });

  describe('remove', () => {
    it('应删除通知', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: '1', read: false }]));
      const removed = await service.remove('1');
      expect(removed).toBe('1');
    });
  });
});
