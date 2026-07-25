/**
 * API 集成测试 — 使用 Supertest 测试 HTTP 端点
 * Mock 所有系统层依赖
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock 所有系统层
vi.mock('../system/filesystem.js', () => ({
  assertSafePath: vi.fn((p: string) => p),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  pathExists: vi.fn().mockResolvedValue(true),
  getDirUsageBytes: vi.fn().mockResolvedValue(1024n),
  getQuotaInfo: vi.fn().mockResolvedValue({ usedBytes: 1024n, quotaBytes: 107374182400n }),
  setUserQuota: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../system/command-executor.js', () => ({
  executeCommand: vi.fn().mockResolvedValue({
    stdout: 'testuser:x:1000:1000::/home/testuser:/bin/bash\n',
    stderr: '',
    exitCode: 0,
  }),
  executeCommandStrict: vi.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  }),
}));

vi.mock('../system/disk.js', () => ({
  getAllDiskHealth: vi.fn().mockResolvedValue([]),
  listBlockDevices: vi.fn().mockResolvedValue([]),
}));

vi.mock('../system/network.js', () => ({
  detectNetworkDrivers: vi.fn().mockResolvedValue([]),
  getInterfaceInfo: vi.fn().mockResolvedValue({
    name: 'eth0',
    linkDetected: false,
    speed: null,
    duplex: null,
    driver: null,
  }),
}));

vi.mock('../system/docker.js', () => ({
  deployContainer: vi.fn().mockResolvedValue('container-id-123'),
  restartContainer: vi.fn().mockResolvedValue(undefined),
  stopContainer: vi.fn().mockResolvedValue(undefined),
  removeContainer: vi.fn().mockResolvedValue(undefined),
  listContainers: vi.fn().mockResolvedValue([]),
  getContainerLogs: vi.fn().mockResolvedValue({ stdout: 'log', stderr: '', exitCode: 0 }),
  isDockerAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../system/tailscale.js', () => ({
  getTailscaleStatus: vi.fn().mockResolvedValue({
    backendState: 'Running',
    self: null,
    peers: [],
    error: null,
  }),
  configureSubnetRouter: vi.fn().mockResolvedValue(undefined),
  getSubnetRoutes: vi.fn().mockResolvedValue([]),
  applyAclPolicy: vi.fn().mockResolvedValue(undefined),
  isTailscaleAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  SECRETS_DIR: '/data/naisys/secrets',
  SYSTEM_CACHE_DIR: '/data/naisys/cache',
  DEFAULT_QUOTA_BYTES: 107374182400n,
  PORT: 3000,
  HOST: '127.0.0.1',
  API_TOKEN: '',
  COMMAND_TIMEOUT_MS: 30000,
  USER_SUBDIRS: ['files', 'config', 'cache'],
  APP_SUBDIRS: ['models', 'data', 'logs'],
}));

import { createApp } from '../app.js';

describe('API 集成测试', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/health', () => {
    it('应返回健康状态', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.service).toBe('naisys-backend');
    });
  });

  describe('POST /api/system/init-data', () => {
    it('应初始化数据目录', async () => {
      const res = await request(app)
        .post('/api/system/init-data')
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dataRoot).toBe('/data');
    });
  });

  describe('GET /api/user/:uid/quota', () => {
    it('应返回用户配额', async () => {
      const res = await request(app).get('/api/user/1000/quota');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.uid).toBe(1000);
    });

    it('无效 UID 应返回 400', async () => {
      const res = await request(app).get('/api/user/abc/quota');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/user/:uid/init', () => {
    it('应初始化用户空间', async () => {
      const res = await request(app)
        .post('/api/user/1000/init')
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/hardware/disk-health', () => {
    it('应返回磁盘健康报告', async () => {
      const res = await request(app).get('/api/hardware/disk-health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalDisks');
    });
  });

  describe('GET /api/hardware/network-drivers', () => {
    it('应返回网卡驱动报告', async () => {
      const res = await request(app).get('/api/hardware/network-drivers');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('drivers');
    });
  });

  describe('POST /api/container/deploy', () => {
    it('应部署容器', async () => {
      const res = await request(app)
        .post('/api/container/deploy')
        .send({
          name: 'test-app',
          image: 'test:latest',
          ports: [{ host: 8080, container: 80 }],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.containerId).toBe('container-id-123');
    });

    it('缺少必填字段应返回 400', async () => {
      const res = await request(app)
        .post('/api/container/deploy')
        .send({ name: 'test' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/container/list', () => {
    it('应返回容器列表', async () => {
      const res = await request(app).get('/api/container/list');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/container/:name/restart', () => {
    it('应重启容器', async () => {
      const res = await request(app).post('/api/container/ollama/restart');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('restarted');
    });
  });

  describe('POST /api/container/:name/stop', () => {
    it('应停止容器', async () => {
      const res = await request(app).post('/api/container/ollama/stop');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('stopped');
    });
  });

  describe('DELETE /api/container/:name', () => {
    it('应删除容器', async () => {
      const res = await request(app).delete('/api/container/ollama');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('removed');
    });

    it('force 参数应生效', async () => {
      const res = await request(app).delete('/api/container/ollama?force=true');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/container/:name/logs', () => {
    it('应返回容器日志', async () => {
      const res = await request(app).get('/api/container/ollama/logs?tail=50');
      expect(res.status).toBe(200);
      expect(res.body.data.stdout).toBe('log');
    });

    it('since 参数应生效', async () => {
      const res = await request(app).get('/api/container/ollama/logs?since=2024-01-01T00:00:00');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/tailscale/status', () => {
    it('应返回 Tailscale 状态', async () => {
      const res = await request(app).get('/api/tailscale/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.available).toBe(true);
    });
  });

  describe('POST /api/tailscale/subnet-router', () => {
    it('应配置 Subnet Router', async () => {
      const res = await request(app)
        .post('/api/tailscale/subnet-router')
        .send({ subnets: ['192.168.1.0/24'] });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('configured');
    });
  });

  describe('POST /api/tailscale/acl', () => {
    it('应下发 ACL 策略', async () => {
      const res = await request(app)
        .post('/api/tailscale/acl')
        .send({ acls: [{ action: 'accept', src: ['*'], dst: ['*:*'] }] });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('applied');
    });
  });

  describe('404 处理', () => {
    it('未知路径应返回 404', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
