/**
 * 模块：审计日志 — 集成测试
 * 使用真实 better-sqlite3 + createApp + supertest 验证 HTTP 端点与中间件
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

// 必须在 import 业务模块前注入临时数据根
const TEST_ROOT = `/tmp/audit-test-${Date.now()}`;
vi.stubEnv('VIBEOS_DATA_ROOT', TEST_ROOT);
vi.stubEnv('VIBEOS_AUTH_DISABLED', 'true');

const { createApp } = await import('../../../app.js');
const dao = await import('../audit.dao.js');
const service = await import('../audit.service.js');

const app = createApp();

afterAll(async () => {
  dao.closeDb();
  const fs = await import('node:fs');
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('审计日志模块', () => {
  describe('auditMiddleware 中间件记录', () => {
    it('API 请求应被自动记录', async () => {
      await request(app).get('/api/health');
      // finish 事件是异步的，等待一小段时间
      await new Promise((r) => setTimeout(r, 100));
      const { rows } = dao.queryLogs({ clause: "path = '/api/health'", params: [] }, 10, 0);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const entry = rows[0]!;
      expect(entry.method).toBe('GET');
      expect(entry.status).toBe(200);
      // /api/health 在 authGuard 之前，req.user 未设置
      expect(entry.username).toBe('anonymous');
      expect(entry.uid).toBe(-1);
    });

    it('受保护路由应记录认证用户', async () => {
      await request(app).get('/api/audit/stats');
      await new Promise((r) => setTimeout(r, 100));
      const { rows } = dao.queryLogs({ clause: "path = '/api/audit/stats'", params: [] }, 10, 0);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const entry = rows[0]!;
      expect(entry.username).toBe('admin'); // AUTH_DISABLED 模式
      expect(entry.uid).toBe(1000);
    });

    it('非 API 路径不应被记录', async () => {
      await request(app).get('/nonexistent');
      await new Promise((r) => setTimeout(r, 100));
      const { rows } = dao.queryLogs({ clause: "path = '/nonexistent'", params: [] }, 10, 0);
      expect(rows.length).toBe(0);
    });
  });

  describe('敏感操作标记', () => {
    it('登录路径应标记为敏感', () => {
      expect(service.isSensitive('POST', '/api/auth/login')).toBe(true);
    });

    it('登出路径应标记为敏感', () => {
      expect(service.isSensitive('POST', '/api/auth/logout')).toBe(true);
    });

    it('用户创建应标记为敏感', () => {
      expect(service.isSensitive('POST', '/api/users')).toBe(true);
    });

    it('用户删除应标记为敏感', () => {
      expect(service.isSensitive('DELETE', '/api/users/1001')).toBe(true);
    });

    it('文件删除应标记为敏感', () => {
      expect(service.isSensitive('DELETE', '/api/files/some/path')).toBe(true);
    });

    it('权限变更应标记为敏感', () => {
      expect(service.isSensitive('PUT', '/api/users/1001/role')).toBe(true);
      expect(service.isSensitive('POST', '/api/auth/change-password')).toBe(true);
    });

    it('服务启停应标记为敏感', () => {
      expect(service.isSensitive('POST', '/api/container/abc/start')).toBe(true);
      expect(service.isSensitive('POST', '/api/apps/myapp/stop')).toBe(true);
    });

    it('普通 GET 请求不应标记为敏感', () => {
      expect(service.isSensitive('GET', '/api/health')).toBe(false);
      expect(service.isSensitive('GET', '/api/audit/logs')).toBe(false);
    });
  });

  describe('GET /api/audit/logs 查询过滤', () => {
    beforeAll(() => {
      // 插入测试数据
      const now = new Date();
      const today = now.toISOString();
      const yesterday = new Date(now.getTime() - 86400000).toISOString();

      dao.insertLog({ uid: 1000, username: 'admin', method: 'POST', path: '/api/auth/login', status: 200, ip: '10.0.0.1', sensitive: 1, timestamp: today });
      dao.insertLog({ uid: 1000, username: 'admin', method: 'GET', path: '/api/health', status: 200, ip: '10.0.0.1', sensitive: 0, timestamp: today });
      dao.insertLog({ uid: 1001, username: 'testuser', method: 'POST', path: '/api/auth/login', status: 401, ip: '10.0.0.2', sensitive: 1, timestamp: today });
      dao.insertLog({ uid: 1001, username: 'testuser', method: 'DELETE', path: '/api/files/doc.txt', status: 200, ip: '10.0.0.2', sensitive: 1, timestamp: yesterday });
      dao.insertLog({ uid: 1000, username: 'admin', method: 'GET', path: '/api/audit/logs', status: 200, ip: '10.0.0.1', sensitive: 0, timestamp: yesterday });
    });

    it('无过滤应返回所有日志（分页）', async () => {
      const res = await request(app).get('/api/audit/logs').query({ size: 100 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(5);
      expect(res.body.data.page).toBe(1);
    });

    it('按用户名过滤', async () => {
      const res = await request(app).get('/api/audit/logs').query({ user: 'testuser', size: 100 });
      expect(res.status).toBe(200);
      const usernames = res.body.data.logs.map((l: { username: string }) => l.username);
      expect(usernames.every((u: string) => u === 'testuser')).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(2);
    });

    it('按操作过滤（模糊匹配）', async () => {
      const res = await request(app).get('/api/audit/logs').query({ action: 'login', size: 100 });
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBeGreaterThanOrEqual(2);
      res.body.data.logs.forEach((l: { path: string }) => {
        expect(l.path).toContain('login');
      });
    });

    it('按时间范围过滤', async () => {
      const now = new Date();
      const from = new Date(now.getTime() - 3600000).toISOString(); // 1 小时前
      const to = new Date(now.getTime() + 3600000).toISOString(); // 1 小时后
      const res = await request(app).get('/api/audit/logs').query({ from, to, size: 100 });
      expect(res.status).toBe(200);
      // 应只包含今天的记录
      expect(res.body.data.total).toBeGreaterThanOrEqual(3);
    });

    it('分页应正确切分', async () => {
      // 使用 user 过滤避免审计中间件记录自身查询导致数据偏移
      const page1 = await request(app).get('/api/audit/logs').query({ user: 'testuser', size: 1, page: 1 });
      expect(page1.body.data.logs).toHaveLength(1);
      expect(page1.body.data.total).toBeGreaterThanOrEqual(2);
      const page2 = await request(app).get('/api/audit/logs').query({ user: 'testuser', size: 1, page: 2 });
      expect(page2.body.data.page).toBe(2);
      // 不同页不应有相同 id
      const id1 = page1.body.data.logs[0].id;
      const id2 = page2.body.data.logs[0].id;
      expect(id1).not.toBe(id2);
    });
  });

  describe('GET /api/audit/stats 统计', () => {
    it('应返回今日统计', async () => {
      const res = await request(app).get('/api/audit/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.todayTotal).toBeGreaterThanOrEqual(3);
      expect(res.body.data.todayLogins).toBeGreaterThanOrEqual(2);
      expect(res.body.data.todaySensitive).toBeGreaterThanOrEqual(2);
    });
  });

  describe('POST /api/audit/export 导出', () => {
    it('JSON 格式导出', async () => {
      const res = await request(app)
        .post('/api/audit/export')
        .send({ format: 'json' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('timestamp');
    });

    it('CSV 格式导出', async () => {
      const res = await request(app)
        .post('/api/audit/export')
        .send({ format: 'csv' });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const lines = res.text.split('\n');
      expect(lines[0]).toBe('id,uid,username,method,path,status,ip,sensitive,timestamp');
      expect(lines.length).toBeGreaterThanOrEqual(6); // header + 5 rows
    });

    it('带过滤的导出', async () => {
      const res = await request(app)
        .post('/api/audit/export')
        .send({ format: 'json', user: 'admin' });
      expect(res.status).toBe(200);
      res.body.data.forEach((l: { username: string }) => {
        expect(l.username).toBe('admin');
      });
    });

    it('无效格式应返回 400', async () => {
      const res = await request(app)
        .post('/api/audit/export')
        .send({ format: 'xml' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/audit/rotate 轮转', () => {
    it('应删除 90 天前的记录', async () => {
      // 插入一条 100 天前的记录
      const old = new Date(Date.now() - 100 * 86400000).toISOString();
      dao.insertLog({ uid: 9999, username: 'olduser', method: 'GET', path: '/api/old', status: 200, ip: '1.1.1.1', sensitive: 0, timestamp: old });

      const res = await request(app).post('/api/audit/rotate');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBeGreaterThanOrEqual(1);

      // 旧记录应被删除
      const { rows } = dao.queryLogs({ clause: "username = 'olduser'", params: [] }, 10, 0);
      expect(rows.length).toBe(0);
    });
  });

  describe('service 层单元测试', () => {
    it('recordLog 应自动标记敏感操作', () => {
      service.recordLog({ uid: 1000, username: 'admin', method: 'POST', path: '/api/auth/login', status: 200, ip: '127.0.0.1' });
      const { rows } = dao.queryLogs({ clause: "path = '/api/auth/login' AND username = 'admin'", params: [] }, 1, 0);
      expect(rows[0]!.sensitive).toBe(1);
    });

    it('recordLog 普通操作 sensitive 应为 0', () => {
      service.recordLog({ uid: 1000, username: 'admin', method: 'GET', path: '/api/metrics', status: 200, ip: '127.0.0.1' });
      const { rows } = dao.queryLogs({ clause: "path = '/api/metrics'", params: [] }, 1, 0);
      expect(rows[0]!.sensitive).toBe(0);
    });

    it('exportLogs CSV 应正确转义特殊字符', () => {
      dao.insertLog({ uid: 1000, username: 'user,name', method: 'GET', path: '/api/test"a', status: 200, ip: '127.0.0.1', sensitive: 0, timestamp: new Date().toISOString() });
      const csv = service.exportLogs({ format: 'csv' }) as string;
      expect(csv).toContain('"user,name"');
      expect(csv).toContain('"/api/test""a"');
    });
  });
});
