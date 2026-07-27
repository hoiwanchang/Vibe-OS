/**
 * 模块3 扩展：AI 应用目录初始化 — 单元测试
 * Mock filesystem 系统层，验证 initAppDirs 的校验与目录创建逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  SECRETS_DIR: '/data/naisys/secrets',
  SYSTEM_CACHE_DIR: '/data/naisys/cache',
  DEFAULT_QUOTA_BYTES: 107374182400n,
  USER_SUBDIRS: ['files', 'config', 'cache'],
  APP_SUBDIRS: ['models', 'data', 'logs'],
  PORT: 3000,
  HOST: '127.0.0.1',
  API_TOKEN: '',
  COMMAND_TIMEOUT_MS: 30000,
}));

vi.mock('../../../system/filesystem.js', () => ({
  assertSafePath: vi.fn((p: string) => p),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  pathExists: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../system/docker.js', () => ({
  deployContainer: vi.fn(),
  restartContainer: vi.fn(),
  stopContainer: vi.fn(),
  removeContainer: vi.fn(),
  listContainers: vi.fn(),
  getContainerLogs: vi.fn(),
  isDockerAvailable: vi.fn(),
}));

vi.mock('../../../system/tailscale.js', () => ({
  getTailscaleStatus: vi.fn(),
  configureSubnetRouter: vi.fn(),
  getSubnetRoutes: vi.fn(),
  applyAclPolicy: vi.fn(),
  isTailscaleAvailable: vi.fn(),
}));

import { pathExists } from '../../../system/filesystem.js';
import * as service from '../container.service.js';
import * as controller from '../container.controller.js';

describe('container.service.initAppDirs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pathExists).mockResolvedValue(false);
  });

  it('应创建应用根目录与 models/data/logs 子目录', async () => {
    const result = await service.initAppDirs('ollama');
    expect(result.appDir).toBe('/data/naisys/ollama');
    expect(result.createdDirs).toEqual([
      '/data/naisys/ollama',
      '/data/naisys/ollama/models',
      '/data/naisys/ollama/data',
      '/data/naisys/ollama/logs',
    ]);
  });

  it('目录已存在时应跳过创建', async () => {
    vi.mocked(pathExists).mockResolvedValue(true);
    const result = await service.initAppDirs('ollama');
    expect(result.createdDirs).toEqual([]);
  });

  it('非法应用名应抛出 INVALID_APPNAME', async () => {
    await expect(service.initAppDirs('../evil')).rejects.toThrow('应用名');
    await expect(service.initAppDirs('bad name')).rejects.toThrow('应用名');
    await expect(service.initAppDirs('-leading')).rejects.toThrow('应用名');
  });
});

describe('container.controller.handleInitAppDirs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pathExists).mockResolvedValue(false);
  });

  it('应返回 201 与应用目录信息', async () => {
    const json = vi.fn().mockReturnThis();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as unknown as import('express').Response;
    const req = {
      body: { appname: 'dify' },
    } as unknown as import('express').Request;

    await controller.handleInitAppDirs(req, res);
    expect(status).toHaveBeenCalledWith(201);
    expect(json.mock.calls[0]?.[0].data.appDir).toBe('/data/naisys/dify');
  });
});
