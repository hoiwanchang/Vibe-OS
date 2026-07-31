/**
 * 模块：QoS 带宽控制 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn(),
  executeCommandStrict: vi.fn(),
}));

import { executeCommand, executeCommandStrict } from '../../../system/command-executor.js';
import { createApp } from '../../../app.js';
import * as service from '../qos.service.js';

const mockExec = vi.mocked(executeCommand);
const mockExecStrict = vi.mocked(executeCommandStrict);

describe('QoS 带宽控制', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    service._resetForTesting();
    app = createApp();
    mockExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mockExecStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  /* ---------- GET /api/qos/rules ---------- */

  describe('GET /api/qos/rules', () => {
    it('初始时应返回空列表', async () => {
      const res = await request(app).get('/api/qos/rules');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('创建后应返回规则列表', async () => {
      await request(app)
        .post('/api/qos/rules')
        .send({
          interface: 'eth0',
          type: 'ip',
          target: '192.168.1.100',
          direction: 'egress',
          rateLimit: '10mbit',
        });

      const res = await request(app).get('/api/qos/rules');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].interface).toBe('eth0');
      expect(res.body.data[0].type).toBe('ip');
      expect(res.body.data[0].rateLimit).toBe('10mbit');
    });
  });

  /* ---------- POST /api/qos/rules ---------- */

  describe('POST /api/qos/rules', () => {
    it('应成功创建 IP 限速规则', async () => {
      const res = await request(app)
        .post('/api/qos/rules')
        .send({
          interface: 'eth0',
          type: 'ip',
          target: '192.168.1.100',
          direction: 'egress',
          rateLimit: '10mbit',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ruleId).toBeTruthy();
      expect(res.body.data.message).toContain('eth0');

      // 验证 tc 命令被调用
      expect(mockExec).toHaveBeenCalledWith(
        'tc',
        expect.arrayContaining(['qdisc', 'add', 'dev', 'eth0']),
      );
      expect(mockExecStrict).toHaveBeenCalledWith(
        'tc',
        expect.arrayContaining(['class', 'add', 'dev', 'eth0']),
      );
      expect(mockExecStrict).toHaveBeenCalledWith(
        'tc',
        expect.arrayContaining(['filter', 'add', 'dev', 'eth0']),
      );
    });

    it('应成功创建端口限速规则', async () => {
      const res = await request(app)
        .post('/api/qos/rules')
        .send({
          interface: 'eth0',
          type: 'port',
          target: '8080',
          direction: 'ingress',
          rateLimit: '5mbit',
          priority: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.ruleId).toBeTruthy();
    });

    it('无效速率格式应返回 400', async () => {
      const res = await request(app)
        .post('/api/qos/rules')
        .send({
          interface: 'eth0',
          type: 'ip',
          target: '192.168.1.1',
          direction: 'egress',
          rateLimit: 'invalid',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('缺少必填字段应返回 400', async () => {
      const res = await request(app)
        .post('/api/qos/rules')
        .send({ interface: 'eth0' });

      expect(res.status).toBe(400);
    });
  });

  /* ---------- DELETE /api/qos/rules/:id ---------- */

  describe('DELETE /api/qos/rules/:id', () => {
    it('应成功删除已有规则', async () => {
      const createRes = await request(app)
        .post('/api/qos/rules')
        .send({
          interface: 'eth0',
          type: 'ip',
          target: '10.0.0.1',
          direction: 'egress',
          rateLimit: '1gbit',
        });

      const ruleId = createRes.body.data.ruleId as string;

      const delRes = await request(app).delete(`/api/qos/rules/${ruleId}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
      expect(delRes.body.data.message).toContain('删除');

      // 确认已删除
      const listRes = await request(app).get('/api/qos/rules');
      expect(listRes.body.data.length).toBe(0);
    });

    it('删除不存在的规则应返回 404', async () => {
      const res = await request(app).delete('/api/qos/rules/nonexist');
      expect(res.status).toBe(404);
    });
  });

  /* ---------- GET /api/qos/status ---------- */

  describe('GET /api/qos/status', () => {
    it('应解析 tc -s qdisc show 输出', async () => {
      mockExec.mockResolvedValueOnce({
        stdout: [
          'qdisc htb 1: dev eth0 root refcnt 2 r2q 10 default 0x10',
          ' Sent 1234567 bytes 8901 pkt (dropped 5, overlimits 3 requeues 0)',
          '',
          'qdisc noqueue 0: dev lo root refcnt 2',
          ' Sent 0 bytes 0 pkt (dropped 0, overlimits 0 requeues 0)',
        ].join('\n'),
        stderr: '',
        exitCode: 0,
      });

      const res = await request(app).get('/api/qos/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const ifaces = res.body.data.interfaces;
      expect(ifaces.length).toBe(2);
      expect(ifaces[0].interface).toBe('eth0');
      expect(ifaces[0].qdisc).toBe('htb');
      expect(ifaces[0].bytes).toBe(1234567);
      expect(ifaces[0].packets).toBe(8901);
      expect(ifaces[0].dropped).toBe(5);
      expect(ifaces[0].overlimits).toBe(3);
    });

    it('无输出时应返回空列表', async () => {
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const res = await request(app).get('/api/qos/status');
      expect(res.status).toBe(200);
      expect(res.body.data.interfaces).toEqual([]);
    });
  });
});
