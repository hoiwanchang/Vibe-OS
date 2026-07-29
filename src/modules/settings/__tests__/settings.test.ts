/**
 * 模块：系统设置中心 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../app.js';

// Mock child_process 避免真实系统调用
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null, stdout: string, stderr: string) => void) => {
    if (typeof _opts === 'function') {
      cb = _opts as (err: Error | null, stdout: string, stderr: string) => void;
    }
    cb?.(null, '', '');
  }),
}));

const app = createApp();

describe('Settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/settings', () => {
    it('返回完整配置对象', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('general');
      expect(res.body.data).toHaveProperty('security');
      expect(res.body.data).toHaveProperty('storage');
      expect(res.body.data).toHaveProperty('power');
      expect(res.body.data).toHaveProperty('notification');
      expect(res.body.data).toHaveProperty('update');
    });

    it('general 包含必要字段', async () => {
      const res = await request(app).get('/api/settings');
      const g = res.body.data.general;
      expect(g).toHaveProperty('hostname');
      expect(g).toHaveProperty('timezone');
      expect(g).toHaveProperty('ntpEnabled');
    });
  });

  describe('GET /api/settings/:section', () => {
    it('返回单个分区', async () => {
      const res = await request(app).get('/api/settings/general');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('hostname');
    });

    it('无效分区返回 400', async () => {
      const res = await request(app).get('/api/settings/invalid_section');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_SECTION');
    });
  });

  describe('PUT /api/settings/:section', () => {
    it('更新分区配置', async () => {
      const res = await request(app)
        .put('/api/settings/general')
        .send({ description: '测试 NAS' });
      expect(res.status).toBe(200);
      expect(res.body.data.updated).toBe('general');
    });

    it('空请求体返回 400', async () => {
      const res = await request(app)
        .put('/api/settings/general')
        .send({});
      expect(res.status).toBe(400);
    });

    it('无效分区返回 400', async () => {
      const res = await request(app)
        .put('/api/settings/bogus')
        .send({ foo: 'bar' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/settings/services', () => {
    it('返回服务列表', async () => {
      const res = await request(app).get('/api/settings/services');
      expect(res.status).toBe(200);
      expect(res.body.data.services).toBeInstanceOf(Array);
      expect(res.body.data.services.length).toBeGreaterThan(0);
      expect(res.body.data.services[0]).toHaveProperty('name');
      expect(res.body.data.services[0]).toHaveProperty('displayName');
    });
  });

  describe('POST /api/settings/services/:name/toggle', () => {
    it('缺少 enabled 返回 400', async () => {
      const res = await request(app)
        .post('/api/settings/services/ssh/toggle')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/settings/services/:name/restart', () => {
    it('无效服务名返回 404', async () => {
      const res = await request(app)
        .post('/api/settings/services/nonexistent/restart');
      // 服务不在注册表中 → 404 或 502（取决于 systemctl mock）
      expect([404, 502]).toContain(res.status);
    });
  });

  describe('GET /api/settings/about', () => {
    it('返回关于信息', async () => {
      const res = await request(app).get('/api/settings/about');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('version');
      expect(res.body.data).toHaveProperty('nodeVersion');
      expect(res.body.data).toHaveProperty('license', 'MIT');
    });
  });

  describe('GET /api/settings/logs/sources', () => {
    it('返回日志源列表', async () => {
      const res = await request(app).get('/api/settings/logs/sources');
      expect(res.status).toBe(200);
      expect(res.body.data.sources).toBeInstanceOf(Array);
      expect(res.body.data.sources.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/settings/logs', () => {
    it('无效日志源返回 404', async () => {
      const res = await request(app).get('/api/settings/logs?source=bogus');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/settings/update/check', () => {
    it('返回更新检查结果', async () => {
      const res = await request(app).post('/api/settings/update/check');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('updateAvailable');
    });
  });

  describe('POST /api/settings/notification/test', () => {
    it('缺少 channelType 返回 400', async () => {
      const res = await request(app)
        .post('/api/settings/notification/test')
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
