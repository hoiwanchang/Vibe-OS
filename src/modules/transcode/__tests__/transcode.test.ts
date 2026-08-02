/**
 * 模块：视频转码 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn(),
  executeCommandStrict: vi.fn(),
}));

vi.mock('../../../system/filesystem.js', () => ({
  ensureDir: vi.fn(),
}));

import { executeCommand } from '../../../system/command-executor.js';
import * as service from '../transcode.service.js';

const mockExec = vi.mocked(executeCommand);

describe('视频转码', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service._resetForTesting();
  });

  /* ---------- listTasks ---------- */

  describe('listTasks', () => {
    it('初始时应返回空列表', () => {
      const tasks = service.listTasks();
      expect(tasks).toEqual([]);
    });
  });

  /* ---------- createTask ---------- */

  describe('createTask', () => {
    it('应创建任务并返回 ID', async () => {
      // ffmpeg 执行（异步，不阻塞）
      mockExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.createTask({
        inputPath: '/data/videos/test.mkv',
        preset: '720p',
      });

      expect(result.taskId).toBeTruthy();
      expect(result.message).toContain('720p');

      const tasks = service.listTasks();
      expect(tasks.length).toBe(1);
      expect(tasks[0]!.inputPath).toBe('/data/videos/test.mkv');
      expect(tasks[0]!.preset).toBe('720p');
    });

    it('应自动生成输出路径', async () => {
      mockExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.createTask({
        inputPath: '/data/videos/movie.mkv',
        preset: '1080p',
      });

      const task = service.getTask(result.taskId);
      expect(task.outputPath).toContain('movie_1080p');
    });

    it('应使用自定义输出路径', async () => {
      mockExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.createTask({
        inputPath: '/data/videos/movie.mkv',
        outputPath: '/data/output/movie.mp4',
        preset: '480p',
      });

      const task = service.getTask(result.taskId);
      expect(task.outputPath).toBe('/data/output/movie.mp4');
    });
  });

  /* ---------- getTask ---------- */

  describe('getTask', () => {
    it('任务不存在时应抛出 404', () => {
      expect(() => service.getTask('nonexist')).toThrow('不存在');
    });
  });

  /* ---------- deleteTask ---------- */

  describe('deleteTask', () => {
    it('应删除排队中的任务', async () => {
      // 让 ffmpeg 永远不完成（模拟排队）
      mockExec.mockReturnValue(new Promise(() => {}));

      // 创建 3 个任务，第 3 个应排队
      await service.createTask({ inputPath: '/data/a.mkv', preset: '720p' });
      await service.createTask({ inputPath: '/data/b.mkv', preset: '720p' });
      const result3 = await service.createTask({ inputPath: '/data/c.mkv', preset: '720p' });

      // 第 3 个应为 queued
      const task3 = service.getTask(result3.taskId);
      expect(task3.status).toBe('queued');

      // 删除排队任务
      const delResult = service.deleteTask(result3.taskId);
      expect(delResult.message).toContain('删除');

      // 任务应从列表中移除
      expect(() => service.getTask(result3.taskId)).toThrow('不存在');
    });

    it('任务不存在时应抛出 404', () => {
      expect(() => service.deleteTask('nonexist')).toThrow('不存在');
    });
  });

  /* ---------- 并发控制 ---------- */

  describe('并发控制', () => {
    it('最多 2 个任务同时运行', async () => {
      // ffmpeg 永远不完成
      mockExec.mockReturnValue(new Promise(() => {}));

      await service.createTask({ inputPath: '/data/a.mkv', preset: '720p' });
      await service.createTask({ inputPath: '/data/b.mkv', preset: '720p' });
      await service.createTask({ inputPath: '/data/c.mkv', preset: '720p' });

      const tasks = service.listTasks();
      const running = tasks.filter(t => t.status === 'running');
      const queued = tasks.filter(t => t.status === 'queued');

      expect(running.length).toBe(2);
      expect(queued.length).toBe(1);
    });
  });

  /* ---------- detectHwAccel ---------- */

  describe('detectHwAccel', () => {
    it('两者都不可用时应返回 none', async () => {
      mockExec.mockResolvedValue({ stdout: '', stderr: 'not found', exitCode: 1 });

      const info = await service.detectHwAccel();
      expect(info.vaapi).toBe(false);
      expect(info.nvenc).toBe(false);
      expect(info.available).toContain('none');
      expect(info.available).toContain('auto');
    });

    it('VAAPI 可用时应包含 vaapi', async () => {
      // vainfo 成功
      mockExec.mockResolvedValueOnce({
        stdout: 'libva info: VA-API version 1.20.0',
        stderr: '',
        exitCode: 0,
      });
      // nvidia-smi 失败
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 1 });

      const info = await service.detectHwAccel();
      expect(info.vaapi).toBe(true);
      expect(info.nvenc).toBe(false);
      expect(info.available).toContain('vaapi');
    });

    it('NVENC 可用时应包含 nvenc', async () => {
      // vainfo 失败
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 1 });
      // nvidia-smi 成功
      mockExec.mockResolvedValueOnce({
        stdout: 'NVIDIA GeForce RTX 3080\n',
        stderr: '',
        exitCode: 0,
      });

      const info = await service.detectHwAccel();
      expect(info.vaapi).toBe(false);
      expect(info.nvenc).toBe(true);
      expect(info.available).toContain('nvenc');
      expect(info.details).toContain('RTX 3080');
    });
  });
});
