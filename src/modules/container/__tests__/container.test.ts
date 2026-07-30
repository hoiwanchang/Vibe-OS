/**
 * 模块3：Docker 与 Tailscale 服务编排 — 单元测试
 * Mock 系统层 docker/tailscale 模块
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 系统层
vi.mock('../../../system/docker.js', () => ({
  deployContainer: vi.fn().mockResolvedValue('abc123def456'),
  restartContainer: vi.fn().mockResolvedValue(undefined),
  stopContainer: vi.fn().mockResolvedValue(undefined),
  removeContainer: vi.fn().mockResolvedValue(undefined),
  listContainers: vi.fn().mockResolvedValue([
    {
      id: 'abc123',
      name: 'ollama',
      image: 'ollama/ollama:latest',
      status: 'Up 2 hours',
      state: 'running',
      ports: '0.0.0.0:11434->11434/tcp',
      createdAt: '2024-01-01 00:00:00',
    },
  ]),
  getContainerLogs: vi.fn().mockResolvedValue({
    stdout: 'container log line 1\n',
    stderr: '',
    exitCode: 0,
  }),
  isDockerAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../system/tailscale.js', () => ({
  getTailscaleStatus: vi.fn().mockResolvedValue({
    backendState: 'Running',
    self: {
      hostname: 'vibeos-node',
      ips: ['100.64.0.1'],
      os: 'linux',
      online: true,
    },
    peers: [
      {
        id: 'peer1',
        hostname: 'laptop',
        ips: ['100.64.0.2'],
        os: 'windows',
        online: true,
        active: true,
      },
    ],
    error: null,
  }),
  configureSubnetRouter: vi.fn().mockResolvedValue(undefined),
  getSubnetRoutes: vi.fn().mockResolvedValue([
    { cidr: '192.168.1.0/24', advertised: true, approved: true },
  ]),
  applyAclPolicy: vi.fn().mockResolvedValue(undefined),
  isTailscaleAvailable: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../system/filesystem.js', () => ({
  assertSafePath: vi.fn((p: string) => {
    if (!p.startsWith('/data')) {
      const err = new Error('路径穿越');
      (err as Error & { statusCode?: number }).statusCode = 403;
      throw err;
    }
    return p;
  }),
  assertSafePathReal: vi.fn(async (p: string) => {
    if (!p.startsWith('/data')) {
      const err = new Error('路径穿越');
      (err as Error & { statusCode?: number }).statusCode = 403;
      throw err;
    }
    return p;
  }),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  pathExists: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../config.js', () => ({
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

import * as service from '../container.service.js';
import * as dao from '../container.dao.js';
import { AppError } from '../../../common/app-error.js';

describe('模块3：Docker 与 Tailscale 服务编排', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deployApp', () => {
    it('应成功部署容器', async () => {
      const result = await service.deployApp({
        name: 'ollama',
        image: 'ollama/ollama:latest',
        ports: [{ host: 11434, container: 11434 }],
        volumes: [{ host: '/data/vibeos/ollama/models', container: '/root/.ollama' }],
      });

      expect(result.containerId).toBe('abc123def456');
      expect(result.name).toBe('ollama');
      expect(result.status).toBe('deployed');
    });

    it('Docker 不可用时应抛出错误', async () => {
      const { isDockerAvailable } = await import('../../../system/docker.js');
      vi.mocked(isDockerAvailable).mockResolvedValue(false);

      await expect(
        service.deployApp({ name: 'test', image: 'test:latest' }),
      ).rejects.toThrow();
    });

    it('卷挂载路径不在 /data/ 内应被拒绝', async () => {
      await expect(
        service.deployApp({
          name: 'evil',
          image: 'evil:latest',
          volumes: [{ host: '/etc/passwd', container: '/data' }],
        }),
      ).rejects.toThrow();
    });

    it('非法容器名应被拒绝', async () => {
      await expect(
        service.deployApp({
          name: 'bad;rm -rf /',
          image: 'test:latest',
        }),
      ).rejects.toThrow(AppError);
    });
  });

  describe('listApps', () => {
    it('应返回容器列表', async () => {
      const result = await service.listApps();
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('ollama');
    });
  });

  describe('getAppLogs', () => {
    it('应返回容器日志', async () => {
      const result = await service.getAppLogs('ollama', 50);
      expect(result.stdout).toContain('container log');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('getTailscaleReport', () => {
    it('应返回完整 Tailscale 状态', async () => {
      const report = await service.getTailscaleReport();

      expect(report.available).toBe(true);
      expect(report.status.backendState).toBe('Running');
      expect(report.status.self?.hostname).toBe('vibeos-node');
      expect(report.status.peers).toHaveLength(1);
      expect(report.subnetRoutes).toHaveLength(1);
    });

    it('Tailscale 不可用时应返回降级响应', async () => {
      const { isTailscaleAvailable } = await import('../../../system/tailscale.js');
      vi.mocked(isTailscaleAvailable).mockResolvedValue(false);

      const report = await service.getTailscaleReport();
      expect(report.available).toBe(false);
      expect(report.status.backendState).toBe('NotInstalled');
    });
  });

  describe('setupSubnetRouting', () => {
    it('应成功配置 Subnet Router', async () => {
      await expect(
        service.setupSubnetRouting(['192.168.1.0/24']),
      ).resolves.not.toThrow();
    });

    it('无效 CIDR 应被拒绝', async () => {
      await expect(
        service.setupSubnetRouting(['invalid']),
      ).rejects.toThrow(AppError);
    });
  });

  describe('pushAcl', () => {
    it('应成功下发 ACL 策略', async () => {
      await expect(
        service.pushAcl(JSON.stringify({ acls: [] })),
      ).resolves.not.toThrow();
    });

    it('无效 JSON 应被拒绝', async () => {
      await expect(service.pushAcl('not json')).rejects.toThrow(AppError);
    });
  });

  describe('DAO 层', () => {
    it('createContainer 应调用系统层', async () => {
      const id = await dao.createContainer({
        name: 'test',
        image: 'test:latest',
      });
      expect(id).toBe('abc123def456');
    });

    it('fetchTailscaleStatus 应调用系统层', async () => {
      const status = await dao.fetchTailscaleStatus();
      expect(status.backendState).toBe('Running');
    });
  });
});
