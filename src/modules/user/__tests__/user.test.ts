/**
 * 模块5：用户与权限管理 — 单元测试
 * Mock node:fs/promises、filesystem 系统层与 config
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';

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
  getDirUsageBytes: vi.fn().mockResolvedValue(1024n),
  getQuotaInfo: vi
    .fn()
    .mockResolvedValue({ usedBytes: 1024n, quotaBytes: 107374182400n }),
  setUserQuota: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  access: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
}));

import { setUserQuota } from '../../../system/filesystem.js';
import * as service from '../user.service.js';
import * as controller from '../user.controller.js';

const PASSWD_CONTENT = [
  'root:x:0:0::/root:/bin/bash',
  'naisys:x:999:999::/data/naisys:/usr/sbin/nologin',
  'alice:x:1000:1000::/home/alice:/bin/bash',
  'bob:x:1001:1001::/home/bob:/bin/bash',
  '',
].join('\n');

const MAPPING_CONTENT = JSON.stringify({ '1002': 'carol' });

/**
 * 配置 fs.readFile 按路径返回不同内容
 */
function setupFsReads(mapping = MAPPING_CONTENT): void {
  vi.mocked(fs.readFile).mockImplementation(async (p) => {
    const path =
      typeof p === 'string' ? p : (p as Buffer).toString('utf-8');
    if (path === '/etc/passwd') return PASSWD_CONTENT;
    if (path === '/data/naisys/users.json') return mapping;
    throw new Error(`ENOENT: ${path}`);
  });
}

describe('user.service.listManagedUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFsReads();
  });

  it('应合并 /data 目录、passwd 与映射文件中的用户', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['1000', '1002', 'naisys', 'not-a-uid'] as never);

    const result = await service.listManagedUsers();
    // /data: {1000,1002} ∪ passwd: {1000,1001} ∪ mapping: {1002} = [1000,1001,1002]
    expect(result.count).toBe(3);
    expect(result.users.map((u) => u.uid)).toEqual([1000, 1001, 1002]);
    expect(result.users[0]?.username).toBe('alice');
    expect(result.users[1]?.username).toBe('bob');
    expect(result.users[2]?.username).toBe('carol');
  });

  it('无用户名来源时应回退为 UID 字符串', async () => {
    vi.mocked(fs.readdir).mockResolvedValue(['2000'] as never);
    const result = await service.listManagedUsers();
    const user2000 = result.users.find((u) => u.uid === 2000);
    expect(user2000?.username).toBe('2000');
  });

  it('/data 不可读时应仅返回 passwd 与映射文件用户', async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error('EACCES'));
    const result = await service.listManagedUsers();
    expect(result.users.map((u) => u.uid)).toEqual([1000, 1001, 1002]);
  });

  it('配额不可用时应回退默认配额', async () => {
    const { getQuotaInfo } = await import('../../../system/filesystem.js');
    vi.mocked(getQuotaInfo).mockResolvedValue(null);
    vi.mocked(fs.readdir).mockResolvedValue([] as never);
    const result = await service.listManagedUsers();
    expect(result.users[0]?.quotaBytes).toBe('107374182400');
  });
});

describe('user.service.createUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFsReads();
    vi.mocked(fs.readdir).mockResolvedValue(['1000', '1002'] as never);
  });

  it('应自动分配 UID 并创建目录结构', async () => {
    const result = await service.createUser({ username: 'dave' });
    // max(1000,1001,1002)+1 = 1003
    expect(result.uid).toBe(1003);
    expect(result.username).toBe('dave');
    expect(result.dataDir).toBe('/data/1003');
    // /data/1003 + files/config/cache
    expect(result.createdDirs).toHaveLength(4);
    expect(result.quotaSet).toBe(true);
    // 映射文件应写入
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('应支持指定 UID 与自定义配额', async () => {
    const result = await service.createUser({
      username: 'eve',
      uid: 3000,
      quotaBytes: '5000',
    });
    expect(result.uid).toBe(3000);
    expect(setUserQuota).toHaveBeenCalledWith(3000, 5000n);
  });

  it('非法用户名应抛出 INVALID_USERNAME', async () => {
    await expect(service.createUser({ username: 'Dave!' })).rejects.toThrow(
      '用户名',
    );
    await expect(service.createUser({ username: '1abc' })).rejects.toThrow(
      '用户名',
    );
  });

  it('用户名已占用应抛出冲突错误', async () => {
    await expect(service.createUser({ username: 'alice' })).rejects.toThrow(
      '已被占用',
    );
    await expect(service.createUser({ username: 'carol' })).rejects.toThrow(
      '已被占用',
    );
  });

  it('UID 超出范围应抛出 INVALID_UID', async () => {
    await expect(
      service.createUser({ username: 'frank', uid: 999 }),
    ).rejects.toThrow('UID');
  });

  it('UID 已占用应抛出冲突错误', async () => {
    await expect(
      service.createUser({ username: 'frank', uid: 1000 }),
    ).rejects.toThrow('已被占用');
  });

  it('配额设置失败时 quotaSet 应为 false 且不阻塞创建', async () => {
    vi.mocked(setUserQuota).mockRejectedValue(new Error('EOPNOTSUPP'));
    const result = await service.createUser({ username: 'grace' });
    expect(result.quotaSet).toBe(false);
    expect(result.uid).toBe(1003);
  });
});

describe('user.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFsReads();
    vi.mocked(fs.readdir).mockResolvedValue([] as never);
  });

  it('handleListUsers 应返回 success 包装', async () => {
    const json = vi.fn().mockReturnThis();
    const res = { json } as unknown as import('express').Response;
    await controller.handleListUsers({} as import('express').Request, res);
    expect(json.mock.calls[0]?.[0]).toMatchObject({ success: true });
  });

  it('handleCreateUser 应返回 201 与创建结果', async () => {
    const json = vi.fn().mockReturnThis();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status } as unknown as import('express').Response;
    const req = {
      body: { username: 'henry' },
    } as unknown as import('express').Request;
    await controller.handleCreateUser(req, res);
    expect(status).toHaveBeenCalledWith(201);
    expect(json.mock.calls[0]?.[0].data.username).toBe('henry');
  });
});
