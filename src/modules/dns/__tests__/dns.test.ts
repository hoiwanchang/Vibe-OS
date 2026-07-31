/**
 * 模块：DNS 服务器 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn(),
  executeCommandStrict: vi.fn(),
}));

vi.mock('../../../system/filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

import { executeCommand } from '../../../system/command-executor.js';
import { createApp } from '../../../app.js';

const mockExec = vi.mocked(executeCommand);

describe('DNS 服务器', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    mockExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockWriteFile.mockResolvedValue(undefined);
  });

  /* ---------- GET /api/dns/status ---------- */

  describe('GET /api/dns/status', () => {
    it('服务未运行时应返回 running=false', async () => {
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 1 });

      const res = await request(app).get('/api/dns/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.running).toBe(false);
      expect(res.body.data.pid).toBeNull();
    });

    it('服务运行中应返回 PID 和版本', async () => {
      // pgrep 返回 PID
      mockExec.mockResolvedValueOnce({ stdout: '12345\n', stderr: '', exitCode: 0 });
      // dnsmasq --version
      mockExec.mockResolvedValueOnce({
        stdout: 'Dnsmasq version 2.90  Copyright (c) 2000-2024 Simon Kelley\n',
        stderr: '',
        exitCode: 0,
      });

      const res = await request(app).get('/api/dns/status');
      expect(res.status).toBe(200);
      expect(res.body.data.running).toBe(true);
      expect(res.body.data.pid).toBe(12345);
      expect(res.body.data.version).toContain('Dnsmasq');
    });
  });

  /* ---------- GET /api/dns/records ---------- */

  describe('GET /api/dns/records', () => {
    it('无记录时应返回空列表', async () => {
      const res = await request(app).get('/api/dns/records');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('有记录时应返回列表', async () => {
      const records = [
        { id: 'abc123', type: 'A', name: 'nas.local', value: '192.168.1.10', ttl: 3600, createdAt: '2026-01-01T00:00:00.000Z' },
      ];
      mockReadFile.mockResolvedValueOnce(JSON.stringify(records));

      const res = await request(app).get('/api/dns/records');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('nas.local');
    });
  });

  /* ---------- POST /api/dns/records ---------- */

  describe('POST /api/dns/records', () => {
    it('应成功添加 A 记录', async () => {
      const res = await request(app)
        .post('/api/dns/records')
        .send({ type: 'A', name: 'nas.local', value: '192.168.1.10' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.recordId).toBeTruthy();
      expect(res.body.data.message).toContain('nas.local');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('应成功添加 CNAME 记录', async () => {
      const res = await request(app)
        .post('/api/dns/records')
        .send({ type: 'CNAME', name: 'www.local', value: 'nas.local', ttl: 7200 });

      expect(res.status).toBe(201);
      expect(res.body.data.recordId).toBeTruthy();
    });

    it('重复记录应返回 409', async () => {
      const existing = [
        { id: 'abc', type: 'A', name: 'nas.local', value: '192.168.1.10', ttl: 3600, createdAt: '2026-01-01T00:00:00.000Z' },
      ];
      mockReadFile.mockResolvedValueOnce(JSON.stringify(existing));

      const res = await request(app)
        .post('/api/dns/records')
        .send({ type: 'A', name: 'nas.local', value: '192.168.1.20' });

      expect(res.status).toBe(409);
    });

    it('缺少必填字段应返回 400', async () => {
      const res = await request(app)
        .post('/api/dns/records')
        .send({ type: 'A' });

      expect(res.status).toBe(400);
    });
  });

  /* ---------- DELETE /api/dns/records/:id ---------- */

  describe('DELETE /api/dns/records/:id', () => {
    it('应成功删除已有记录', async () => {
      const existing = [
        { id: 'rec1', type: 'A', name: 'nas.local', value: '192.168.1.10', ttl: 3600, createdAt: '2026-01-01T00:00:00.000Z' },
      ];
      mockReadFile.mockResolvedValueOnce(JSON.stringify(existing));

      const res = await request(app).delete('/api/dns/records/rec1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('删除');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('删除不存在的记录应返回 404', async () => {
      const res = await request(app).delete('/api/dns/records/nonexist');
      expect(res.status).toBe(404);
    });
  });

  /* ---------- GET /api/dns/config ---------- */

  describe('GET /api/dns/config', () => {
    it('无配置文件时应返回默认配置', async () => {
      const res = await request(app).get('/api/dns/config');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.upstreamServers).toEqual(['8.8.8.8', '8.8.4.4']);
      expect(res.body.data.listenAddress).toBe('0.0.0.0');
      expect(res.body.data.cacheSize).toBe(1000);
    });

    it('有配置文件时应返回已保存配置', async () => {
      const config = {
        upstreamServers: ['1.1.1.1'],
        listenAddress: '192.168.1.1',
        cacheSize: 500,
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(config));

      const res = await request(app).get('/api/dns/config');
      expect(res.status).toBe(200);
      expect(res.body.data.upstreamServers).toEqual(['1.1.1.1']);
      expect(res.body.data.cacheSize).toBe(500);
    });
  });

  /* ---------- PUT /api/dns/config ---------- */

  describe('PUT /api/dns/config', () => {
    it('应成功更新配置', async () => {
      const res = await request(app)
        .put('/api/dns/config')
        .send({
          upstreamServers: ['1.1.1.1', '9.9.9.9'],
          listenAddress: '192.168.1.1',
          cacheSize: 2000,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.upstreamServers).toEqual(['1.1.1.1', '9.9.9.9']);
      expect(res.body.data.listenAddress).toBe('192.168.1.1');
      expect(res.body.data.cacheSize).toBe(2000);
      // 应写入配置文件和 dnsmasq.conf
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('部分更新应保留未修改字段', async () => {
      const existing = {
        upstreamServers: ['8.8.8.8'],
        listenAddress: '10.0.0.1',
        cacheSize: 500,
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(existing));

      const res = await request(app)
        .put('/api/dns/config')
        .send({ upstreamServers: ['1.1.1.1'] });

      expect(res.status).toBe(200);
      expect(res.body.data.upstreamServers).toEqual(['1.1.1.1']);
      expect(res.body.data.listenAddress).toBe('10.0.0.1');
      expect(res.body.data.cacheSize).toBe(500);
    });

    it('空上游列表应返回 400', async () => {
      const res = await request(app)
        .put('/api/dns/config')
        .send({ upstreamServers: [] });

      expect(res.status).toBe(400);
    });
  });
});
