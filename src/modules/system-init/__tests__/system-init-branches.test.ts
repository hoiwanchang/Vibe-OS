/**
 * system-init service 分支补充 — initUserSpace 配额设置失败路径
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../system/filesystem.js', () => ({
  assertSafePath: vi.fn((p: string) => p),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  pathExists: vi.fn().mockResolvedValue(true),
  getDirUsageBytes: vi.fn().mockResolvedValue(0n),
  getQuotaInfo: vi.fn().mockResolvedValue(null),
  setUserQuota: vi.fn().mockRejectedValue(new Error('quota not supported')),
}));

vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn().mockResolvedValue({
    stdout: 'testuser:x:1000:1000::/home/testuser:/bin/bash\n',
    stderr: '',
    exitCode: 0,
  }),
  executeCommandStrict: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  SECRETS_DIR: '/data/vibeos/secrets',
  SYSTEM_CACHE_DIR: '/data/vibeos/cache',
  USER_SUBDIRS: ['files', 'config', 'cache'],
  APP_SUBDIRS: ['models', 'data', 'logs'],
  DEFAULT_QUOTA_BYTES: 107374182400n,
  PORT: 3000,
  HOST: '127.0.0.1',
  API_TOKEN: '',
  COMMAND_TIMEOUT_MS: 30000,
}));

import * as service from '../system-init.service.js';

describe('system-init service 分支', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initUserSpace 配额设置失败不应阻塞初始化', async () => {
    const result = await service.initUserSpace(1000);
    expect(result.uid).toBe(1000);
    expect(result.dataDir).toBe('/data/1000');
  });

  it('initUserSpace 自定义配额应生效', async () => {
    const result = await service.initUserSpace(1000, 53687091200n);
    expect(result.uid).toBe(1000);
  });

  it('getUserQuota 无配额信息应使用默认值', async () => {
    const result = await service.getUserQuota(1000);
    expect(result.quotaBytes).toBe('107374182400');
  });
});
