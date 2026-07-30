/**
 * API 集成测试 — 新模块 Supertest 覆盖
 * Mock 所有系统层 + fs，测试 HTTP 端点
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock 系统层
vi.mock('../system/command-executor.js', () => ({
  executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  executeCommandStrict: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
}));
vi.mock('../system/filesystem.js', () => ({
  assertSafePath: vi.fn((p: string) => p),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  resolveInData: vi.fn((p: string) => `/data/${p}`),
}));
vi.mock('../system/disk.js', () => ({
  listBlockDevices: vi.fn().mockResolvedValue([]),
  getDiskSmartInfo: vi.fn().mockResolvedValue(null),
  getAllDiskHealth: vi.fn().mockResolvedValue([]),
}));
vi.mock('../system/network.js', () => ({
  detectNetworkDrivers: vi.fn().mockResolvedValue([]),
  getInterfaceInfo: vi.fn().mockResolvedValue(null),
}));
vi.mock('../system/docker.js', () => ({
  deployContainer: vi.fn().mockResolvedValue({ id: 'c1', name: 'test' }),
  listContainers: vi.fn().mockResolvedValue([]),
  restartContainer: vi.fn().mockResolvedValue(undefined),
  stopContainer: vi.fn().mockResolvedValue(undefined),
  removeContainer: vi.fn().mockResolvedValue(undefined),
  getContainerLogs: vi.fn().mockResolvedValue({ logs: '' }),
}));
vi.mock('../system/tailscale.js', () => ({
  getTailscaleStatus: vi.fn().mockResolvedValue({ backendState: 'Running', self: {}, peers: [] }),
  getTailscalePeers: vi.fn().mockResolvedValue([]),
  getSubnetRoutes: vi.fn().mockResolvedValue([]),
  configureSubnetRouter: vi.fn().mockResolvedValue(undefined),
  applyAclPolicy: vi.fn().mockResolvedValue(undefined),
}));

// Mock fs for modules that use it directly
const mockReadFile = vi.fn().mockRejectedValue(new Error('ENOENT'));
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockStat = vi.fn().mockResolvedValue({ isDirectory: () => true, size: 0, mtime: new Date(), mode: 0o755 });
const mockReaddir = vi.fn().mockResolvedValue([]);
const mockLstat = vi.fn().mockResolvedValue({ size: 0, mtime: new Date(), mode: 0o644 });
const mockAccess = vi.fn().mockResolvedValue(undefined);
const mockRm = vi.fn().mockResolvedValue(undefined);
const mockRename = vi.fn().mockResolvedValue(undefined);
const mockCp = vi.fn().mockResolvedValue(undefined);
const mockOpen = vi.fn().mockResolvedValue({ read: vi.fn().mockResolvedValue({}), close: vi.fn().mockResolvedValue(undefined) });
const mockAppendFile = vi.fn().mockResolvedValue(undefined);

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  lstat: (...args: unknown[]) => mockLstat(...args),
  access: (...args: unknown[]) => mockAccess(...args),
  rm: (...args: unknown[]) => mockRm(...args),
  rename: (...args: unknown[]) => mockRename(...args),
  cp: (...args: unknown[]) => mockCp(...args),
  open: (...args: unknown[]) => mockOpen(...args),
  appendFile: (...args: unknown[]) => mockAppendFile(...args),
}));
vi.mock('node:fs', () => ({
  createReadStream: vi.fn().mockReturnValue({ pipe: vi.fn() }),
  createWriteStream: vi.fn().mockReturnValue({}),
}));
vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('mime-types', () => ({
  lookup: vi.fn().mockReturnValue('text/plain'),
}));
vi.mock('../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  SECRETS_DIR: '/data/vibeos/secrets',
  SYSTEM_CACHE_DIR: '/data/vibeos/cache',
  USER_SUBDIRS: ['files', 'config', 'cache'],
  DEFAULT_QUOTA_BYTES: 10737418240,
  COMMAND_TIMEOUT_MS: 5000,
  PORT: 3000,
  HOST: '127.0.0.1',
  API_TOKEN: '',
  AUTH_DISABLED: true,
  OIDC_ISSUER: 'http://127.0.0.1:3000',
  ADMIN_PASSWORD: 'vibeos',
  SESSION_TTL_MS: 86400000,
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCK_MS: 900000,
  ACCESS_TOKEN_TTL_S: 3600,
  REFRESH_TOKEN_TTL_MS: 2592000000,
  AUTH_CODE_TTL_MS: 600000,
  SESSION_COOKIE_NAME: 'vibeos.sid',
  IS_PRODUCTION: false,
  SSH_TARGET_USER: 'vibeuser',
  SSH_AUTHORIZED_KEYS_FILE: '',
  APP_SUBDIRS: ['models', 'data', 'logs'],
}));

import { createApp } from '../app.js';

describe('新模块 API 集成测试', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  // ===== 文件管理器 =====
  describe('文件管理器', () => {
    it('GET /api/files/list 应返回目录列表', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true, size: 0, mtime: new Date(), mode: 0o755 });
      mockReaddir.mockResolvedValue([
        { name: 'test.txt', isSymbolicLink: () => false, isDirectory: () => false },
      ]);
      mockLstat.mockResolvedValue({ size: 100, mtime: new Date(), mode: 0o644 });
      const res = await request(app).get('/api/files/list?uid=1000&path=files');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.entries).toHaveLength(1);
    });

    it('GET /api/files/read 应返回文件内容', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => false, size: 5, mtime: new Date(), mode: 0o644 });
      const res = await request(app).get('/api/files/read?uid=1000&path=test.txt');
      expect(res.status).toBe(200);
      expect(res.body.data.truncated).toBe(false);
    });

    it('POST /api/files/mkdir 应创建目录', async () => {
      const res = await request(app).post('/api/files/mkdir').send({ path: 'newdir', uid: 1000 });
      expect(res.status).toBe(201);
      expect(res.body.data.created).toBe('newdir');
    });

    it('POST /api/files/write 应写入文件', async () => {
      mockStat.mockResolvedValue({ size: 12, isDirectory: () => false });
      const res = await request(app).post('/api/files/write').send({ path: 'test.txt', uid: 1000, content: 'hello world!' });
      expect(res.status).toBe(200);
      expect(res.body.data.written).toBe('test.txt');
    });

    it('POST /api/files/rename 应重命名', async () => {
      const res = await request(app).post('/api/files/rename').send({ path: 'old.txt', newName: 'new.txt', uid: 1000 });
      expect(res.status).toBe(200);
      expect(res.body.data.from).toBe('old.txt');
    });

    it('DELETE /api/files/delete 应删除文件', async () => {
      const res = await request(app).delete('/api/files/delete').send({ path: 'test.txt', uid: 1000 });
      expect(res.status).toBe(200);
      expect(res.body.data.method).toBe('trash');
    });

    it('POST /api/files/copy 应复制文件', async () => {
      const res = await request(app).post('/api/files/copy').send({ src: 'a.txt', dest: 'b.txt', uid: 1000 });
      expect(res.status).toBe(200);
      expect(res.body.data.copied).toBe('a.txt');
    });

    it('GET /api/files/trash 应列出回收站', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      const res = await request(app).get('/api/files/trash?uid=1000');
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(0);
    });

    it('DELETE /api/files/trash/empty 应清空回收站', async () => {
      const res = await request(app).delete('/api/files/trash/empty?uid=1000');
      expect(res.status).toBe(200);
    });

    it('POST /api/files/mkdir 参数缺失应 400', async () => {
      const res = await request(app).post('/api/files/mkdir').send({});
      expect(res.status).toBe(400);
    });
  });

  // ===== 存储池 =====
  describe('存储池管理', () => {
    it('GET /api/storage/disks 应返回磁盘列表', async () => {
      const { executeCommand } = await import('../system/command-executor.js');
      vi.mocked(executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ blockdevices: [{ name: 'sda', type: 'disk', size: '1000', model: 'Test', serial: 'S1', fstype: null, mountpoint: null }] }),
        stderr: '',
      });
      const res = await request(app).get('/api/storage/disks');
      expect(res.status).toBe(200);
      expect(res.body.data.disks).toHaveLength(1);
    });

    it('GET /api/storage/pools 应返回池列表', async () => {
      const res = await request(app).get('/api/storage/pools');
      expect(res.status).toBe(200);
      expect(res.body.data.pools).toEqual([]);
    });

    it('POST /api/storage/pools 参数校验', async () => {
      const res = await request(app).post('/api/storage/pools').send({ name: '', level: 'raid0', disks: [] });
      expect(res.status).toBe(400);
    });
  });

  // ===== 共享文件夹 =====
  describe('共享文件夹', () => {
    it('GET /api/sharing 应返回共享列表', async () => {
      const res = await request(app).get('/api/sharing');
      expect(res.status).toBe(200);
      expect(res.body.data.shares).toEqual([]);
    });

    it('POST /api/sharing 应创建共享', async () => {
      const { executeCommand } = await import('../system/command-executor.js');
      vi.mocked(executeCommand).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).post('/api/sharing').send({ name: 'docs', path: '/data/1000/files', protocol: 'smb', readonly: false });
      expect(res.status).toBe(201);
      expect(res.body.data.share.name).toBe('docs');
    });

    it('POST /api/sharing 参数校验', async () => {
      const res = await request(app).post('/api/sharing').send({ name: '', path: '', protocol: 'bad' });
      expect(res.status).toBe(400);
    });
  });

  // ===== 备份 =====
  describe('备份与快照', () => {
    it('GET /api/backup/jobs 应返回任务列表', async () => {
      const res = await request(app).get('/api/backup/jobs');
      expect(res.status).toBe(200);
      expect(res.body.data.jobs).toEqual([]);
    });

    it('POST /api/backup/jobs 应创建任务', async () => {
      const res = await request(app).post('/api/backup/jobs').send({ name: 'daily', source: '/data/1000', target: '/backup', type: 'rsync' });
      expect(res.status).toBe(201);
      expect(res.body.data.job.name).toBe('daily');
    });

    it('GET /api/backup/snapshots 应返回快照列表', async () => {
      const res = await request(app).get('/api/backup/snapshots?pool=test');
      expect(res.status).toBe(200);
    });
  });

  // ===== 下载中心 =====
  describe('下载中心', () => {
    it('GET /api/download/tasks aria2 不可达应 503', async () => {
      const res = await request(app).get('/api/download/tasks');
      expect(res.status).toBe(503);
    });

    it('POST /api/download/tasks 参数校验', async () => {
      const res = await request(app).post('/api/download/tasks').send({ urls: [] });
      expect(res.status).toBe(400);
    });
  });

  // ===== 网络配置 =====
  describe('网络配置', () => {
    it('GET /api/network/interfaces 应返回接口列表', async () => {
      const { executeCommand } = await import('../system/command-executor.js');
      vi.mocked(executeCommand).mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify([{ ifname: 'eth0', link_type: 'ether', operstate: 'UP', address: 'aa:bb', addr_info: [] }]),
        stderr: '',
      });
      const res = await request(app).get('/api/network/interfaces');
      expect(res.status).toBe(200);
      expect(res.body.data.interfaces).toHaveLength(1);
    });

    it('GET /api/network/dns 应返回 DNS 配置', async () => {
      mockReadFile.mockResolvedValue('nameserver 8.8.8.8\n');
      const res = await request(app).get('/api/network/dns');
      expect(res.status).toBe(200);
      expect(res.body.data.servers).toContain('8.8.8.8');
    });

    it('GET /api/network/firewall 应返回规则', async () => {
      const res = await request(app).get('/api/network/firewall');
      expect(res.status).toBe(200);
    });

    it('GET /api/network/ports 应返回端口', async () => {
      const res = await request(app).get('/api/network/ports');
      expect(res.status).toBe(200);
    });

    it('POST /api/network/wol 参数校验', async () => {
      const res = await request(app).post('/api/network/wol').send({});
      expect(res.status).toBe(400);
    });
  });

  // ===== 通知 =====
  describe('通知与告警', () => {
    it('GET /api/notifications 应返回通知列表', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(200);
      expect(res.body.data.notifications).toEqual([]);
    });

    it('GET /api/notifications/unread-count 应返回未读数', async () => {
      const res = await request(app).get('/api/notifications/unread-count');
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(0);
    });

    it('POST /api/notifications/read-all 应全部已读', async () => {
      const res = await request(app).post('/api/notifications/read-all');
      expect(res.status).toBe(200);
    });

    it('GET /api/notifications/settings 应返回配置', async () => {
      const res = await request(app).get('/api/notifications/settings');
      expect(res.status).toBe(200);
    });

    it('PUT /api/notifications/settings 应更新配置', async () => {
      const res = await request(app).put('/api/notifications/settings').send({ channels: [{ type: 'webhook', enabled: true, url: 'http://x', minSeverity: 'warning' }] });
      expect(res.status).toBe(200);
    });
  });

  // ===== 计划任务 =====
  describe('计划任务', () => {
    it('GET /api/scheduler/jobs 应返回任务列表', async () => {
      const res = await request(app).get('/api/scheduler/jobs');
      expect(res.status).toBe(200);
      expect(res.body.data.jobs).toEqual([]);
    });

    it('POST /api/scheduler/jobs 应创建任务', async () => {
      const res = await request(app).post('/api/scheduler/jobs').send({ name: 'test', command: 'echo hi', schedule: '0 * * * *' });
      expect(res.status).toBe(201);
      expect(res.body.data.job.name).toBe('test');
    });

    it('POST /api/scheduler/jobs 危险命令应 403', async () => {
      const res = await request(app).post('/api/scheduler/jobs').send({ name: 'bad', command: 'rm -rf /', schedule: '* * * * *' });
      expect(res.status).toBe(403);
    });

    it('POST /api/scheduler/jobs 参数校验', async () => {
      const res = await request(app).post('/api/scheduler/jobs').send({ name: '' });
      expect(res.status).toBe(400);
    });
  });
});
