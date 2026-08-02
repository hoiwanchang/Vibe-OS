/**
 * 模块：DLNA/UPnP 媒体服务器 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn(),
  executeCommandStrict: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

vi.mock('../../../system/filesystem.js', () => ({
  ensureDir: vi.fn(),
}));

import { executeCommand, executeCommandStrict } from '../../../system/command-executor.js';
import * as fs from 'node:fs/promises';
import * as service from '../media.service.js';

const mockExec = vi.mocked(executeCommand);
const mockExecStrict = vi.mocked(executeCommandStrict);
const mockReadFile = vi.mocked(fs.readFile);

describe('DLNA 媒体服务器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ---------- getStatus ---------- */

  describe('getStatus', () => {
    it('服务未运行时应返回 running=false', async () => {
      // pgrep 返回非零（无进程）
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 1 });
      // loadConfig 读取失败
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const status = await service.getStatus();
      expect(status.running).toBe(false);
      expect(status.pid).toBeNull();
      expect(status.config).toBeNull();
    });

    it('服务运行中应返回 PID 和媒体统计', async () => {
      // pgrep 返回 PID
      mockExec.mockResolvedValueOnce({ stdout: '12345\n', stderr: '', exitCode: 0 });
      // loadConfig 成功
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        sources: [{ path: '/data/videos', type: 'video' }],
        inotify: true,
        port: 8200,
      }));
      // countMediaFiles — find | wc -l
      mockExec.mockResolvedValueOnce({ stdout: '42\n', stderr: '', exitCode: 0 });

      const status = await service.getStatus();
      expect(status.running).toBe(true);
      expect(status.pid).toBe(12345);
      expect(status.videoCount).toBe(42);
      expect(status.config?.port).toBe(8200);
    });
  });

  /* ---------- updateConfig ---------- */

  describe('updateConfig', () => {
    it('应生成配置文件并启动服务', async () => {
      // pgrep — 无运行中进程
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 1 });
      // minidlnad 启动成功
      mockExecStrict.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.updateConfig({
        sources: [
          { path: '/data/videos', type: 'video' },
          { path: '/data/music', type: 'music' },
        ],
        inotify: true,
        port: 8200,
      });

      expect(result.message).toContain('2 个媒体源');
      // 验证 minidlnad 被调用
      expect(mockExecStrict).toHaveBeenCalledWith('minidlnad', expect.arrayContaining(['-f']));
    });

    it('服务运行中应先停止再重启', async () => {
      // pgrep — 有运行中进程
      mockExec.mockResolvedValueOnce({ stdout: '9999\n', stderr: '', exitCode: 0 });
      // kill 旧进程
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      // minidlnad 启动
      mockExecStrict.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await service.updateConfig({
        sources: [{ path: '/data/photos', type: 'photo' }],
        inotify: false,
        port: 9999,
      });

      // 应调用 kill
      expect(mockExec).toHaveBeenCalledWith('kill', ['9999']);
    });
  });

  /* ---------- rescan ---------- */

  describe('rescan', () => {
    it('服务运行中应发送 SIGHUP', async () => {
      // pgrep
      mockExec.mockResolvedValueOnce({ stdout: '5555\n', stderr: '', exitCode: 0 });
      // kill -HUP
      mockExecStrict.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.rescan();
      expect(result.message).toContain('SIGHUP');
      expect(mockExecStrict).toHaveBeenCalledWith('kill', ['-HUP', '5555']);
    });

    it('服务未运行且无配置时应抛出 400', async () => {
      // pgrep — 无进程
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 1 });
      // loadConfig 失败
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(service.rescan()).rejects.toThrow('尚未配置');
    });

    it('服务未运行但有配置时应启动并扫描', async () => {
      // pgrep — 无进程
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 1 });
      // loadConfig 成功
      mockReadFile.mockResolvedValueOnce(JSON.stringify({
        sources: [{ path: '/data/videos', type: 'video' }],
        inotify: true,
        port: 8200,
      }));
      // minidlnad -R 启动
      mockExecStrict.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.rescan();
      expect(result.message).toContain('全量扫描');
      expect(mockExecStrict).toHaveBeenCalledWith('minidlnad', expect.arrayContaining(['-R']));
    });
  });

  /* ---------- getClients ---------- */

  describe('getClients', () => {
    it('日志不存在时应返回空列表', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));

      const clients = await service.getClients();
      expect(clients).toEqual([]);
    });

    it('应解析日志中的客户端连接', async () => {
      mockReadFile.mockResolvedValueOnce(
        '[2026-07-31 10:00:00] clients.c:123: Client connected: IP=192.168.1.100, UA=Kodi\n' +
        '[2026-07-31 10:05:00] clients.c:124: Client connected: IP=192.168.1.101, UA=VLC\n',
      );

      const clients = await service.getClients();
      expect(clients.length).toBe(2);
      expect(clients[0]!.ip).toBe('192.168.1.100');
      expect(clients[0]!.name).toBe('Kodi');
      expect(clients[1]!.ip).toBe('192.168.1.101');
    });
  });
});
