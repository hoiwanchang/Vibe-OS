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
  VIBEOS_APP_DIR: '/data/vibeos',
  SECRETS_DIR: '/data/vibeos/secrets',
  SYSTEM_CACHE_DIR: '/data/vibeos/cache',
  DEFAULT_QUOTA_BYTES: 107374182400n,
  PORT: 3000,
  HOST: '127.0.0.1',
  API_TOKEN: '',
  COMMAND_TIMEOUT_MS: 30000,
  USER_SUBDIRS: ['files', 'config', 'cache'],
  APP_SUBDIRS: ['models', 'data', 'logs'],
}));

vi.mock('../system/metrics.js', () => ({
  getCpuTimes: vi
    .fn()
    .mockReturnValue({ user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }),
  computeCpuUsagePercent: vi.fn().mockReturnValue(25),
  getMemoryInfo: vi.fn().mockReturnValue({
    totalBytes: 8000000000,
    freeBytes: 3000000000,
    usedBytes: 5000000000,
    usedPercent: 62.5,
  }),
  getMounts: vi.fn().mockResolvedValue([
    {
      device: '/dev/sda1',
      mountPoint: '/data',
      fsType: 'ext4',
      totalBytes: 1000000000000,
      freeBytes: 400000000000,
      availableBytes: 380000000000,
      usedBytes: 600000000000,
      usedPercent: 61.2,
    },
  ]),
  getSystemInfo: vi.fn().mockReturnValue({
    hostname: 'vibeos-test',
    platform: 'Linux 6.1.0',
    arch: 'x64',
    cpuModel: 'Test CPU',
    cpuCores: 4,
    uptimeSeconds: 100,
    loadAvg: [0.1, 0.1, 0.1],
    nodeVersion: 'v22.0.0',
  }),
}));

vi.mock('../modules/user/user.dao.js', () => ({
  listManagedUids: vi.fn().mockResolvedValue([1000]),
  getPasswdUsers: vi.fn().mockResolvedValue(new Map([[1000, 'alice']])),
  getNaisysUserMappings: vi.fn().mockResolvedValue(new Map()),
  saveNaisysUserMapping: vi.fn().mockResolvedValue(undefined),
  getUserUsage: vi.fn().mockResolvedValue(1024n),
  isUsernameTaken: vi.fn().mockResolvedValue(false),
  isUidTaken: vi.fn().mockResolvedValue(false),
  allocateNextUid: vi.fn().mockResolvedValue(1005),
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
      expect(res.body.data.service).toBe('vibeos-backend');
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

  describe('GET /api/metrics/*', () => {
    it('/api/metrics/cpu 应返回 CPU 使用率', async () => {
      const res = await request(app).get('/api/metrics/cpu');
      expect(res.status).toBe(200);
      expect(res.body.data.usagePercent).toBe(25);
    });

    it('/api/metrics/memory 应返回内存指标', async () => {
      const res = await request(app).get('/api/metrics/memory');
      expect(res.status).toBe(200);
      expect(res.body.data.usedPercent).toBe(62.5);
    });

    it('/api/metrics/storage 应返回存储池列表', async () => {
      const res = await request(app).get('/api/metrics/storage');
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(1);
    });

    it('/api/metrics/overview 应返回聚合指标', async () => {
      const res = await request(app).get('/api/metrics/overview');
      expect(res.status).toBe(200);
      expect(res.body.data.system.hostname).toBe('vibeos-test');
      expect(res.body.data.cpu.usagePercent).toBe(25);
      expect(res.body.data.memory.usedPercent).toBe(62.5);
      expect(res.body.data.storage).toHaveLength(1);
    });
  });

  describe('用户管理端点', () => {
    it('GET /api/users 应返回受管用户列表', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(1);
      expect(res.body.data.users[0].username).toBe('alice');
    });

    it('POST /api/users 应创建用户数据空间', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ username: 'newuser' });
      expect(res.status).toBe(201);
      expect(res.body.data.uid).toBe(1005);
      expect(res.body.data.dataDir).toBe('/data/1005');
    });

    it('POST /api/users 缺少用户名应返回 400', async () => {
      const res = await request(app).post('/api/users').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/container/init-dirs', () => {
    it('应初始化应用数据目录', async () => {
      const res = await request(app)
        .post('/api/container/init-dirs')
        .send({ appname: 'ollama' });
      expect(res.status).toBe(201);
      expect(res.body.data.appDir).toBe('/data/vibeos/ollama');
    });

    it('缺少 appname 应返回 400', async () => {
      const res = await request(app)
        .post('/api/container/init-dirs')
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
