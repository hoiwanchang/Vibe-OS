/**
 * 模块：应用自动更新 — 单元测试
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

vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  SECRETS_DIR: '/data/vibeos/secrets',
  SYSTEM_CACHE_DIR: '/data/vibeos/cache',
  PORT: 3000,
  HOST: '127.0.0.1',
  API_TOKEN: '',
  COMMAND_TIMEOUT_MS: 5000,
  SSH_TARGET_USER: 'vibeos',
  SSH_AUTHORIZED_KEYS_FILE: '/data/vibeos/secrets/authorized_keys',
  DEFAULT_QUOTA_BYTES: BigInt(107374182400),
  USER_SUBDIRS: ['files', 'config', 'cache'],
  APP_SUBDIRS: ['models', 'data', 'logs'],
  AUTH_DISABLED: true,
  ADMIN_PASSWORD: 'vibeos',
}));

import { createApp } from '../../../app.js';

describe('应用自动更新', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  /* ---------- GET /api/appupdate/status ---------- */
  describe('GET /api/appupdate/status', () => {
    it('无配置时应返回默认状态', async () => {
      const res = await request(app).get('/api/appupdate/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('manual');
      expect(res.body.data.maintenanceWindow).toBeNull();
      expect(res.body.data.lastCheckAt).toBeNull();
      expect(res.body.data.availableCount).toBe(0);
    });

    it('有配置和可用更新时应返回正确状态', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('config.json')) {
          return Promise.resolve(JSON.stringify({
            mode: 'auto',
            maintenanceWindow: '02:00-04:00',
            lastCheckAt: '2025-01-01T00:00:00.000Z',
          }));
        }
        if (p.includes('available.json')) {
          return Promise.resolve(JSON.stringify([
            { appId: 'app1', containerName: 'app1', image: 'img:latest', currentImageId: 'sha:old', latestImageId: 'sha:new', detectedAt: '2025-01-01T00:00:00.000Z' },
          ]));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/appupdate/status');
      expect(res.status).toBe(200);
      expect(res.body.data.mode).toBe('auto');
      expect(res.body.data.maintenanceWindow).toBe('02:00-04:00');
      expect(res.body.data.lastCheckAt).toBe('2025-01-01T00:00:00.000Z');
      expect(res.body.data.availableCount).toBe(1);
    });
  });

  /* ---------- PUT /api/appupdate/config ---------- */
  describe('PUT /api/appupdate/config', () => {
    it('应更新策略为 auto', async () => {
      const res = await request(app)
        .put('/api/appupdate/config')
        .send({ mode: 'auto', maintenanceWindow: '03:00-05:00' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.config.mode).toBe('auto');
      expect(res.body.data.config.maintenanceWindow).toBe('03:00-05:00');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('应更新策略为 manual（不带 maintenanceWindow）', async () => {
      const res = await request(app)
        .put('/api/appupdate/config')
        .send({ mode: 'manual' });
      expect(res.status).toBe(200);
      expect(res.body.data.config.mode).toBe('manual');
    });

    it('无效 mode 应返回 400', async () => {
      const res = await request(app)
        .put('/api/appupdate/config')
        .send({ mode: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('保留已有 maintenanceWindow（未传时不覆盖）', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('config.json')) {
          return Promise.resolve(JSON.stringify({
            mode: 'auto',
            maintenanceWindow: '01:00-02:00',
            lastCheckAt: null,
          }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app)
        .put('/api/appupdate/config')
        .send({ mode: 'manual' });
      expect(res.status).toBe(200);
      expect(res.body.data.config.maintenanceWindow).toBe('01:00-02:00');
    });
  });

  /* ---------- POST /api/appupdate/check ---------- */
  describe('POST /api/appupdate/check', () => {
    it('docker ps 失败应返回 500', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'docker error', exitCode: 1 });

      const res = await request(app).post('/api/appupdate/check');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('无容器时应返回空列表', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const res = await request(app).post('/api/appupdate/check');
      expect(res.status).toBe(200);
      expect(res.body.data.updates).toEqual([]);
    });

    it('有可用更新时应返回更新列表', async () => {
      // docker ps
      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'myapp\tmyapp/image:latest\n', stderr: '', exitCode: 0 })
        // inspect before
        .mockResolvedValueOnce({ stdout: 'sha256:old123\n', stderr: '', exitCode: 0 })
        // docker pull
        .mockResolvedValueOnce({ stdout: 'pulled', stderr: '', exitCode: 0 })
        // inspect after
        .mockResolvedValueOnce({ stdout: 'sha256:new456\n', stderr: '', exitCode: 0 });

      const res = await request(app).post('/api/appupdate/check');
      expect(res.status).toBe(200);
      expect(res.body.data.updates).toHaveLength(1);
      expect(res.body.data.updates[0].appId).toBe('myapp');
      expect(res.body.data.updates[0].currentImageId).toBe('sha256:old123');
      expect(res.body.data.updates[0].latestImageId).toBe('sha256:new456');
    });

    it('镜像无变化时不应返回更新', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'myapp\tmyapp/image:latest\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'sha256:same\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'pulled', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'sha256:same\n', stderr: '', exitCode: 0 });

      const res = await request(app).post('/api/appupdate/check');
      expect(res.status).toBe(200);
      expect(res.body.data.updates).toHaveLength(0);
    });

    it('pull 失败时应跳过该容器', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'myapp\tmyapp/image:latest\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'sha256:old\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'pull failed', exitCode: 1 })
        .mockResolvedValueOnce({ stdout: 'sha256:old\n', stderr: '', exitCode: 0 });

      const res = await request(app).post('/api/appupdate/check');
      expect(res.status).toBe(200);
      expect(res.body.data.updates).toHaveLength(0);
    });

    it('inspect 失败时 currentId 为空应跳过', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'myapp\tmyapp/image:latest\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 1 })
        .mockResolvedValueOnce({ stdout: 'pulled', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'sha256:new\n', stderr: '', exitCode: 0 });

      const res = await request(app).post('/api/appupdate/check');
      expect(res.status).toBe(200);
      expect(res.body.data.updates).toHaveLength(0);
    });

    it('单个容器检查异常不影响其他容器', async () => {
      // 清除前面测试残留的 mockResolvedValueOnce 队列
      mockExecuteCommand.mockReset();
      let inspectCount = 0;
      mockExecuteCommand.mockImplementation(async (_cmd: unknown, args: unknown) => {
        const a = (args as string[]) ?? [];
        if (a[0] === 'ps') return { stdout: 'app1\timg1:v1\napp2\timg2:v1\n', stderr: '', exitCode: 0 };
        if (a[0] === 'inspect') {
          if (a.includes('img1:v1')) throw new Error('boom');
          inspectCount++;
          return { stdout: inspectCount <= 1 ? 'sha256:old\n' : 'sha256:new\n', stderr: '', exitCode: 0 };
        }
        if (a[0] === 'pull') return { stdout: 'ok', stderr: '', exitCode: 0 };
        return { stdout: '', stderr: '', exitCode: 0 };
      });

      const res = await request(app).post('/api/appupdate/check');
      // 核心断言：app1 抛异常不导致整个请求失败
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // app2 应被检测到更新（img2:v1 old→new）
      expect(res.body.data.updates).toHaveLength(1);
      expect(res.body.data.updates[0].appId).toBe('app2');
    });

    it('应更新 lastCheckAt', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      await request(app).post('/api/appupdate/check');
      // 验证 writeFile 被调用（保存 config 和 available）
      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  /* ---------- GET /api/appupdate/available ---------- */
  describe('GET /api/appupdate/available', () => {
    it('无可用更新时应返回空列表', async () => {
      const res = await request(app).get('/api/appupdate/available');
      expect(res.status).toBe(200);
      expect(res.body.data.updates).toEqual([]);
    });

    it('有可用更新时应返回列表', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('available.json')) {
          return Promise.resolve(JSON.stringify([
            { appId: 'app1', containerName: 'app1', image: 'img:v1', currentImageId: 'sha:a', latestImageId: 'sha:b', detectedAt: '2025-01-01T00:00:00.000Z' },
          ]));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/appupdate/available');
      expect(res.status).toBe(200);
      expect(res.body.data.updates).toHaveLength(1);
      expect(res.body.data.updates[0].appId).toBe('app1');
    });
  });

  /* ---------- POST /api/appupdate/apply/:appId ---------- */
  describe('POST /api/appupdate/apply/:appId', () => {
    it('应用不存在应返回 404', async () => {
      const res = await request(app).post('/api/appupdate/apply/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('应成功应用更新', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('available.json')) {
          return Promise.resolve(JSON.stringify([
            { appId: 'myapp', containerName: 'myapp', image: 'img:latest', currentImageId: 'sha:old', latestImageId: 'sha:new', detectedAt: '2025-01-01T00:00:00.000Z' },
          ]));
        }
        if (p.includes('history.json')) return Promise.resolve(JSON.stringify([]));
        return Promise.reject(new Error('ENOENT'));
      });

      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'pulled', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'restarted', stderr: '', exitCode: 0 });

      const res = await request(app).post('/api/appupdate/apply/myapp');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.entry.status).toBe('success');
      expect(res.body.data.entry.appId).toBe('myapp');
      expect(res.body.data.entry.previousImageId).toBe('sha:old');
      expect(res.body.data.entry.newImageId).toBe('sha:new');
      expect(res.body.data.entry.finishedAt).toBeTruthy();
    });

    it('docker pull 失败应记录 failed 状态', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('available.json')) {
          return Promise.resolve(JSON.stringify([
            { appId: 'myapp', containerName: 'myapp', image: 'img:latest', currentImageId: 'sha:old', latestImageId: 'sha:new', detectedAt: '2025-01-01T00:00:00.000Z' },
          ]));
        }
        if (p.includes('history.json')) return Promise.resolve(JSON.stringify([]));
        return Promise.reject(new Error('ENOENT'));
      });

      mockExecuteCommand.mockResolvedValueOnce({ stdout: '', stderr: 'network error', exitCode: 1 });

      const res = await request(app).post('/api/appupdate/apply/myapp');
      expect(res.status).toBe(200);
      expect(res.body.data.entry.status).toBe('failed');
      expect(res.body.data.entry.error).toContain('docker pull');
    });

    it('docker restart 失败应记录 failed 状态', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('available.json')) {
          return Promise.resolve(JSON.stringify([
            { appId: 'myapp', containerName: 'myapp', image: 'img:latest', currentImageId: 'sha:old', latestImageId: 'sha:new', detectedAt: '2025-01-01T00:00:00.000Z' },
          ]));
        }
        if (p.includes('history.json')) return Promise.resolve(JSON.stringify([]));
        return Promise.reject(new Error('ENOENT'));
      });

      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'pulled', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'restart failed', exitCode: 1 });

      const res = await request(app).post('/api/appupdate/apply/myapp');
      expect(res.status).toBe(200);
      expect(res.body.data.entry.status).toBe('failed');
      expect(res.body.data.entry.error).toContain('docker restart');
    });

    it('apply 后应从可用列表移除', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('available.json')) {
          return Promise.resolve(JSON.stringify([
            { appId: 'myapp', containerName: 'myapp', image: 'img:latest', currentImageId: 'sha:old', latestImageId: 'sha:new', detectedAt: '2025-01-01T00:00:00.000Z' },
          ]));
        }
        if (p.includes('history.json')) return Promise.resolve(JSON.stringify([]));
        return Promise.reject(new Error('ENOENT'));
      });

      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 });

      await request(app).post('/api/appupdate/apply/myapp');
      // 验证 writeFile 被调用（保存 history 和 available）
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('非字符串错误应转为字符串', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('available.json')) {
          return Promise.resolve(JSON.stringify([
            { appId: 'myapp', containerName: 'myapp', image: 'img:latest', currentImageId: 'sha:old', latestImageId: 'sha:new', detectedAt: '2025-01-01T00:00:00.000Z' },
          ]));
        }
        if (p.includes('history.json')) return Promise.resolve(JSON.stringify([]));
        return Promise.reject(new Error('ENOENT'));
      });

      // 抛出非 Error 对象
      mockExecuteCommand.mockRejectedValueOnce('string error');

      const res = await request(app).post('/api/appupdate/apply/myapp');
      expect(res.status).toBe(200);
      expect(res.body.data.entry.status).toBe('failed');
      expect(res.body.data.entry.error).toBe('string error');
    });
  });

  /* ---------- GET /api/appupdate/history ---------- */
  describe('GET /api/appupdate/history', () => {
    it('无历史时应返回空列表', async () => {
      const res = await request(app).get('/api/appupdate/history');
      expect(res.status).toBe(200);
      expect(res.body.data.history).toEqual([]);
    });

    it('有历史时应返回列表', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (p.includes('history.json')) {
          return Promise.resolve(JSON.stringify([
            { id: 'h1', appId: 'app1', containerName: 'app1', image: 'img:v1', previousImageId: 'sha:a', newImageId: 'sha:b', startedAt: '2025-01-01T00:00:00.000Z', finishedAt: '2025-01-01T00:01:00.000Z', status: 'success' },
          ]));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/appupdate/history');
      expect(res.status).toBe(200);
      expect(res.body.data.history).toHaveLength(1);
      expect(res.body.data.history[0].id).toBe('h1');
    });
  });
});
