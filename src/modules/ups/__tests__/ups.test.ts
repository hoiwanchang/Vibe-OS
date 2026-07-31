/**
 * 模块：UPS 电源管理（NUT） — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

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

vi.mock('../../../system/filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

import { createApp } from '../../../app.js';

/** 模拟 upsc 正常输出 */
const UPSC_OUTPUT = `battery.charge: 100
battery.voltage: 13.7
input.voltage: 230.0
ups.load: 25
ups.name: myups
ups.runtime: 1200
ups.status: OL
`;

/** 模拟 upsc 电池模式输出 */
const UPSC_ON_BATTERY = `battery.charge: 45
battery.voltage: 11.2
input.voltage: 0.0
ups.load: 60
ups.name: myups
ups.runtime: 300
ups.status: OB DISCHRG
`;

describe('UPS 电源管理 API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  });

  // ===== GET /api/ups/status =====

  describe('GET /api/ups/status', () => {
    it('应解析在线状态', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: UPSC_OUTPUT,
        stderr: '',
      });

      const res = await request(app).get('/api/ups/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('myups');
      expect(res.body.data.batteryCharge).toBe(100);
      expect(res.body.data.load).toBe(25);
      expect(res.body.data.inputVoltage).toBe(230.0);
      expect(res.body.data.runtime).toBe(1200);
      expect(res.body.data.online).toBe(true);
      expect(res.body.data.rawStatus).toBe('OL');
    });

    it('应解析电池模式状态', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: UPSC_ON_BATTERY,
        stderr: '',
      });

      const res = await request(app).get('/api/ups/status');
      expect(res.status).toBe(200);
      expect(res.body.data.online).toBe(false);
      expect(res.body.data.batteryCharge).toBe(45);
      expect(res.body.data.rawStatus).toBe('OB DISCHRG');
    });

    it('upsc 命令失败应返回 500', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'ERR: UPS not found',
      });

      const res = await request(app).get('/api/ups/status');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('upsc 命令抛异常应返回 500', async () => {
      mockExecuteCommand.mockRejectedValue(new Error('upsc not found'));

      const res = await request(app).get('/api/ups/status');
      expect(res.status).toBe(500);
    });

    it('缺少字段应返回 null', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'ups.status: OL\n',
        stderr: '',
      });

      const res = await request(app).get('/api/ups/status');
      expect(res.status).toBe(200);
      expect(res.body.data.batteryCharge).toBeNull();
      expect(res.body.data.load).toBeNull();
      expect(res.body.data.inputVoltage).toBeNull();
      expect(res.body.data.runtime).toBeNull();
      expect(res.body.data.name).toBe('ups');
    });

    it('无效数值应返回 null', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'battery.charge: N/A\nups.status: OL\n',
        stderr: '',
      });

      const res = await request(app).get('/api/ups/status');
      expect(res.status).toBe(200);
      expect(res.body.data.batteryCharge).toBeNull();
    });
  });

  // ===== GET /api/ups/config =====

  describe('GET /api/ups/config', () => {
    it('无配置文件应返回默认值', async () => {
      const res = await request(app).get('/api/ups/config');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shutdownThreshold).toBe(20);
      expect(res.body.data.notifyEmail).toBeNull();
    });

    it('有配置文件应返回配置', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(
            JSON.stringify({ shutdownThreshold: 30, notifyEmail: 'a@b.com' }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/ups/config');
      expect(res.status).toBe(200);
      expect(res.body.data.shutdownThreshold).toBe(30);
      expect(res.body.data.notifyEmail).toBe('a@b.com');
    });

    it('配置文件损坏应返回默认值', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve('not-json{{{');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/ups/config');
      expect(res.status).toBe(200);
      expect(res.body.data.shutdownThreshold).toBe(20);
    });

    it('配置文件字段缺失应使用默认值', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shutdownThreshold: 50 }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/ups/config');
      expect(res.status).toBe(200);
      expect(res.body.data.shutdownThreshold).toBe(50);
      expect(res.body.data.notifyEmail).toBeNull();
    });
  });

  // ===== PUT /api/ups/config =====

  describe('PUT /api/ups/config', () => {
    it('应更新配置', async () => {
      const res = await request(app)
        .put('/api/ups/config')
        .send({ shutdownThreshold: 15, notifyEmail: 'test@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shutdownThreshold).toBe(15);
      expect(res.body.data.notifyEmail).toBe('test@example.com');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('不带 notifyEmail 应设为 null', async () => {
      const res = await request(app)
        .put('/api/ups/config')
        .send({ shutdownThreshold: 25 });
      expect(res.status).toBe(200);
      expect(res.body.data.notifyEmail).toBeNull();
    });

    it('阈值低于 1 应 400', async () => {
      const res = await request(app)
        .put('/api/ups/config')
        .send({ shutdownThreshold: 0 });
      expect(res.status).toBe(400);
    });

    it('阈值高于 100 应 400', async () => {
      const res = await request(app)
        .put('/api/ups/config')
        .send({ shutdownThreshold: 101 });
      expect(res.status).toBe(400);
    });

    it('无效邮箱应 400', async () => {
      const res = await request(app)
        .put('/api/ups/config')
        .send({ shutdownThreshold: 20, notifyEmail: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('缺少 shutdownThreshold 应 400', async () => {
      const res = await request(app)
        .put('/api/ups/config')
        .send({ notifyEmail: 'a@b.com' });
      expect(res.status).toBe(400);
    });
  });

  // ===== POST /api/ups/test-shutdown =====

  describe('POST /api/ups/test-shutdown', () => {
    it('应记录测试事件', async () => {
      const res = await request(app).post('/api/ups/test-shutdown');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recorded).toBe(true);
      expect(res.body.data.event.type).toBe('test');
      expect(res.body.data.event.message).toContain('模拟关机');
      expect(res.body.data.event.timestamp).toBeTruthy();
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('已有历史时应追加', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('history.json')) {
          return Promise.resolve(
            JSON.stringify([
              { timestamp: '2026-01-01T00:00:00.000Z', type: 'info', message: '旧事件' },
            ]),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).post('/api/ups/test-shutdown');
      expect(res.status).toBe(200);
      // writeFile 应包含 2 条记录
      const writeCall = mockWriteFile.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('history.json'),
      );
      expect(writeCall).toBeTruthy();
      const written = JSON.parse(writeCall![1] as string) as unknown[];
      expect(written).toHaveLength(2);
    });
  });

  // ===== GET /api/ups/history =====

  describe('GET /api/ups/history', () => {
    it('无历史文件应返回空数组', async () => {
      const res = await request(app).get('/api/ups/history');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.events).toEqual([]);
    });

    it('有历史应返回事件列表', async () => {
      const events = [
        { timestamp: '2026-01-01T00:00:00.000Z', type: 'info', message: '事件1' },
        { timestamp: '2026-01-02T00:00:00.000Z', type: 'warning', message: '事件2' },
      ];
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('history.json')) {
          return Promise.resolve(JSON.stringify(events));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/ups/history');
      expect(res.status).toBe(200);
      expect(res.body.data.events).toHaveLength(2);
      expect(res.body.data.events[0].message).toBe('事件1');
    });

    it('历史文件损坏应返回空数组', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('history.json')) {
          return Promise.resolve('{{invalid');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/ups/history');
      expect(res.status).toBe(200);
      expect(res.body.data.events).toEqual([]);
    });

    it('历史文件非数组应返回空数组', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('history.json')) {
          return Promise.resolve(JSON.stringify({ not: 'array' }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/ups/history');
      expect(res.status).toBe(200);
      expect(res.body.data.events).toEqual([]);
    });
  });
});
