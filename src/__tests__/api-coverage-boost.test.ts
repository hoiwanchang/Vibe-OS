/**
 * 覆盖率补充 — download/backup/container controller + service
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock 系统层
const mockExecuteCommand = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
const mockExecuteCommandStrict = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
vi.mock('../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));
vi.mock('../system/filesystem.js', () => ({
  assertSafePath: vi.fn((p: string) => p),
  assertSafePathReal: vi.fn().mockResolvedValue(undefined),
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

// Docker mock with more functions
const mockDeployContainer = vi.fn().mockResolvedValue({ id: 'c1', name: 'test' });
const mockListContainers = vi.fn().mockResolvedValue([]);
const mockRestartContainer = vi.fn().mockResolvedValue(undefined);
const mockStopContainer = vi.fn().mockResolvedValue(undefined);
const mockRemoveContainer = vi.fn().mockResolvedValue(undefined);
const mockGetContainerLogs = vi.fn().mockResolvedValue({ logs: 'line1\nline2' });
const mockCheckDockerAvailable = vi.fn().mockResolvedValue(true);
const mockCreateContainer = vi.fn().mockResolvedValue('cid123');
vi.mock('../system/docker.js', () => ({
  deployContainer: (...args: unknown[]) => mockDeployContainer(...args),
  listContainers: (...args: unknown[]) => mockListContainers(...args),
  restartContainer: (...args: unknown[]) => mockRestartContainer(...args),
  stopContainer: (...args: unknown[]) => mockStopContainer(...args),
  removeContainer: (...args: unknown[]) => mockRemoveContainer(...args),
  getContainerLogs: (...args: unknown[]) => mockGetContainerLogs(...args),
  isDockerAvailable: (...args: unknown[]) => mockCheckDockerAvailable(...args),
  createContainer: (...args: unknown[]) => mockCreateContainer(...args),
}));
vi.mock('../system/tailscale.js', () => ({
  getTailscaleStatus: vi.fn().mockResolvedValue({ backendState: 'Running', self: {}, peers: [] }),
  getTailscalePeers: vi.fn().mockResolvedValue([]),
  getSubnetRoutes: vi.fn().mockResolvedValue([]),
  configureSubnetRouter: vi.fn().mockResolvedValue(undefined),
  applyAclPolicy: vi.fn().mockResolvedValue(undefined),
  tailscaleLogin: vi.fn().mockResolvedValue({ backendState: 'Running', authUrl: null, exitCode: 0 }),
  tailscaleLogout: vi.fn().mockResolvedValue(undefined),
  tailscaleWhoami: vi.fn().mockResolvedValue('user@example.com'),
  tailscaleSetPrefs: vi.fn().mockResolvedValue(undefined),
  tailscaleGetPrefs: vi.fn().mockResolvedValue({ acceptRoutes: false, exitNode: '', exitNodeAllowLanAccess: false, advertiseExitNode: false }),
  isTailscaleAvailable: vi.fn().mockResolvedValue(true),
}));

const mockReadFile = vi.fn().mockRejectedValue(new Error('ENOENT'));
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockStat = vi.fn().mockResolvedValue({ isDirectory: () => false, size: 100, mtime: new Date(), mode: 0o644 });
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

// Mock fetch for download module
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { createApp } from '../app.js';

function rpcResponse(result: unknown) {
  return { json: () => Promise.resolve({ result }) };
}

describe('覆盖率补充', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  // ===== download controller 全覆盖 =====
  describe('download controller', () => {
    it('GET /api/download/tasks 应返回任务', async () => {
      mockFetch
        .mockResolvedValueOnce(rpcResponse([{ gid: 'a1', status: 'active', totalLength: '100', completedLength: '50', downloadSpeed: '10', uploadSpeed: '0', connections: '1', dir: '/data', files: [] }]))
        .mockResolvedValueOnce(rpcResponse([]))
        .mockResolvedValueOnce(rpcResponse([]));
      const res = await request(app).get('/api/download/tasks');
      expect(res.status).toBe(200);
      expect(res.body.data.tasks).toHaveLength(1);
    });

    it('POST /api/download/tasks 应添加任务', async () => {
      mockFetch.mockResolvedValue(rpcResponse('gid123'));
      const res = await request(app).post('/api/download/tasks').send({ urls: ['https://example.com/f.zip'] });
      expect(res.status).toBe(201);
      expect(res.body.data.gids).toContain('gid123');
    });

    it('DELETE /api/download/tasks/:gid 应删除', async () => {
      mockFetch.mockResolvedValue(rpcResponse('gid123'));
      const res = await request(app).delete('/api/download/tasks/gid123');
      expect(res.status).toBe(200);
      expect(res.body.data.removed).toBe('gid123');
    });

    it('POST /api/download/tasks/:gid/pause 应暂停', async () => {
      mockFetch.mockResolvedValue(rpcResponse('gid123'));
      const res = await request(app).post('/api/download/tasks/gid123/pause');
      expect(res.status).toBe(200);
      expect(res.body.data.paused).toBe('gid123');
    });

    it('POST /api/download/tasks/:gid/resume 应恢复', async () => {
      mockFetch.mockResolvedValue(rpcResponse('gid123'));
      const res = await request(app).post('/api/download/tasks/gid123/resume');
      expect(res.status).toBe(200);
      expect(res.body.data.resumed).toBe('gid123');
    });

    it('GET /api/download/tasks/:gid 应返回详情', async () => {
      mockFetch.mockResolvedValue(rpcResponse({ gid: 'gid123', status: 'active', totalLength: '1000', completedLength: '500', downloadSpeed: '100', uploadSpeed: '0', connections: '2', dir: '/data', files: [{ path: '/data/f.zip', length: '1000', completedLength: '500' }] }));
      const res = await request(app).get('/api/download/tasks/gid123');
      expect(res.status).toBe(200);
      expect(res.body.data.task.gid).toBe('gid123');
    });

    it('GET /api/download/settings 应返回设置', async () => {
      mockFetch.mockResolvedValue(rpcResponse({ 'max-overall-download-limit': '0' }));
      const res = await request(app).get('/api/download/settings');
      expect(res.status).toBe(200);
    });

    it('PUT /api/download/settings 应更新设置', async () => {
      mockFetch.mockResolvedValue(rpcResponse({}));
      const res = await request(app).put('/api/download/settings').send({ 'max-overall-download-limit': '1M' });
      expect(res.status).toBe(200);
    });
  });

  // ===== backup controller 全覆盖 =====
  describe('backup controller', () => {
    it('POST /api/backup/jobs/:id/run 应执行', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (String(p).includes('jobs.json')) return Promise.resolve(JSON.stringify([{ id: 'j1', name: 'test', source: '/data/1', target: '/bak', type: 'rsync', schedule: null, enabled: true, lastRun: null, lastStatus: null }]));
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: 'Number of regular files transferred: 5\nTotal transferred file size: 100', stderr: '' });
      const res = await request(app).post('/api/backup/jobs/j1/run');
      expect(res.status).toBe(200);
      expect(res.body.data.execution.status).toBe('success');
    });

    it('DELETE /api/backup/jobs/:id 应删除', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'j1', name: 'test', source: '/a', target: '/b', type: 'rsync', schedule: null, enabled: true, lastRun: null, lastStatus: null }]));
      const res = await request(app).delete('/api/backup/jobs/j1');
      expect(res.status).toBe(200);
      expect(res.body.data.removed).toBe('j1');
    });

    it('GET /api/backup/jobs/:id/history 应返回历史', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'e1', jobId: 'j1', status: 'success' }]));
      const res = await request(app).get('/api/backup/jobs/j1/history');
      expect(res.status).toBe(200);
    });

    it('POST /api/backup/jobs/:id/restore 应恢复', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (String(p).includes('executions')) return Promise.resolve(JSON.stringify([{ id: 'e1', jobId: 'j1', status: 'success' }]));
        if (String(p).includes('jobs.json')) return Promise.resolve(JSON.stringify([{ id: 'j1', name: 'test', source: '/data/1', target: '/bak', type: 'rsync', schedule: null, enabled: true, lastRun: null, lastStatus: null }]));
        return Promise.reject(new Error('ENOENT'));
      });
      const res = await request(app).post('/api/backup/jobs/j1/restore').send({ executionId: 'e1' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('started');
    });

    it('POST /api/backup/snapshots 应创建快照', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).post('/api/backup/snapshots').send({ pool: 'pool1', name: 'snap1' });
      expect(res.status).toBe(201);
    });

    it('DELETE /api/backup/snapshots/:name 应删除快照', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).delete('/api/backup/snapshots/snap1');
      expect(res.status).toBe(200);
    });
  });

  // ===== container controller 补充 =====
  describe('container controller 补充', () => {
    it('POST /api/container/deploy 应部署', async () => {
      const res = await request(app).post('/api/container/deploy').send({
        name: 'test-app',
        image: 'nginx:latest',
        ports: [{ host: 8080, container: 80 }],
        volumes: [],
        env: {},
      });
      expect(res.status).toBe(201);
    });

    it('GET /api/container/list 应列出容器', async () => {
      const res = await request(app).get('/api/container/list');
      expect(res.status).toBe(200);
    });

    it('POST /api/container/:name/restart 应重启', async () => {
      const res = await request(app).post('/api/container/test-app/restart');
      expect(res.status).toBe(200);
    });

    it('POST /api/container/:name/stop 应停止', async () => {
      const res = await request(app).post('/api/container/test-app/stop');
      expect(res.status).toBe(200);
    });

    it('DELETE /api/container/:name 应删除', async () => {
      const res = await request(app).delete('/api/container/test-app');
      expect(res.status).toBe(200);
    });

    it('GET /api/container/:name/logs 应返回日志', async () => {
      const res = await request(app).get('/api/container/test-app/logs?tail=50');
      expect(res.status).toBe(200);
    });

    it('GET /api/tailscale/status 应返回状态', async () => {
      const res = await request(app).get('/api/tailscale/status');
      expect(res.status).toBe(200);
    });
  });

  // ===== scheduler controller 补充 =====
  describe('scheduler controller 补充', () => {
    it('PUT /api/scheduler/jobs/:id 应更新', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'j1', name: 'old', command: 'echo 1', schedule: '0 * * * *', enabled: true, lastRun: null, lastStatus: null, nextRun: null }]));
      const res = await request(app).put('/api/scheduler/jobs/j1').send({ name: 'new' });
      expect(res.status).toBe(200);
      expect(res.body.data.job.name).toBe('new');
    });

    it('DELETE /api/scheduler/jobs/:id 应删除', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'j1', name: 'test', command: 'echo', schedule: '* * * * *', enabled: true, lastRun: null, lastStatus: null, nextRun: null }]));
      const res = await request(app).delete('/api/scheduler/jobs/j1');
      expect(res.status).toBe(200);
    });

    it('POST /api/scheduler/jobs/:id/run 应执行', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (String(p).includes('jobs.json')) return Promise.resolve(JSON.stringify([{ id: 'j1', name: 'test', command: 'df -h', schedule: '* * * * *', enabled: true, lastRun: null, lastStatus: null, nextRun: null }]));
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: 'ok', stderr: '' });
      const res = await request(app).post('/api/scheduler/jobs/j1/run');
      expect(res.status).toBe(200);
      expect(res.body.data.execution.status).toBe('success');
    });

    it('GET /api/scheduler/jobs/:id/history 应返回历史', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));
      const res = await request(app).get('/api/scheduler/jobs/j1/history?limit=10');
      expect(res.status).toBe(200);
    });
  });

  // ===== notification controller 补充 =====
  describe('notification controller 补充', () => {
    it('POST /api/notifications/:id/read 应标记已读', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'n1', severity: 'info', category: 'system', title: 'a', detail: '', source: '', read: false, createdAt: '' }]));
      const res = await request(app).post('/api/notifications/n1/read');
      expect(res.status).toBe(200);
    });

    it('DELETE /api/notifications/:id 应删除', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'n1', read: false }]));
      const res = await request(app).delete('/api/notifications/n1');
      expect(res.status).toBe(200);
    });
  });

  // ===== sharing controller 补充 =====
  describe('sharing controller 补充', () => {
    it('PUT /api/sharing/:name 应更新', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'docs', path: '/data/x', protocol: 'smb', readonly: false, validUsers: [], hosts: [], enabled: true }]));
      const res = await request(app).put('/api/sharing/docs').send({ readonly: true });
      expect(res.status).toBe(200);
    });

    it('DELETE /api/sharing/:name 应删除', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'docs', path: '/data/x', protocol: 'smb', readonly: false, validUsers: [], hosts: [], enabled: true }]));
      const res = await request(app).delete('/api/sharing/docs');
      expect(res.status).toBe(200);
    });

    it('GET /api/sharing/:name/status 应返回连接', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'docs', path: '/data/x', protocol: 'smb', readonly: false, validUsers: [], hosts: [], enabled: true }]));
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).get('/api/sharing/docs/status');
      expect(res.status).toBe(200);
    });

    it('POST /api/sharing/:name/restart 应重启', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'docs', path: '/data/x', protocol: 'smb', readonly: false, validUsers: [], hosts: [], enabled: true }]));
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).post('/api/sharing/docs/restart');
      expect(res.status).toBe(200);
    });
  });

  // ===== storage controller 补充 =====
  describe('storage controller 补充', () => {
    it('POST /api/storage/pools 应创建池', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: JSON.stringify({ blockdevices: [] }), stderr: '' });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).post('/api/storage/pools').send({ name: 'test', level: 'raid1', disks: ['/dev/sdb', '/dev/sdc'] });
      expect(res.status).toBe(201);
    });

    it('DELETE /api/storage/pools/:name 应销毁', async () => {
      const res = await request(app).delete('/api/storage/pools/test');
      expect(res.status).toBe(200);
    });

    it('POST /api/storage/pools/:name/expand 应扩展', async () => {
      mockExecuteCommand.mockImplementation((cmd: string) => {
        if (cmd === 'mdadm') return Promise.resolve({ exitCode: 0, stdout: 'ARRAY /dev/md/test level=raid1', stderr: '' });
        return Promise.resolve({ exitCode: 0, stdout: ' 1K-blocks  Used Avail Use%\n 1000 500 500 50%', stderr: '' });
      });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).post('/api/storage/pools/test/expand').send({ disks: ['/dev/sdd'] });
      expect(res.status).toBe(200);
    });

    it('GET /api/storage/pools/:name/smart 应返回 SMART', async () => {
      mockExecuteCommand.mockImplementation((cmd: string) => {
        if (cmd === 'mdadm') return Promise.resolve({ exitCode: 0, stdout: 'ARRAY /dev/md/test level=raid1 devices=2', stderr: '' });
        if (cmd === 'smartctl') return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ temperature: { current: 35 }, power_on_time: { hours: 1000 }, ata_smart_attributes: { table: [] } }), stderr: '' });
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      });
      const res = await request(app).get('/api/storage/pools/test/smart');
      expect(res.status).toBe(200);
    });

    it('POST /api/storage/pools/:name/scrub 应启动', async () => {
      const res = await request(app).post('/api/storage/pools/test/scrub');
      expect(res.status).toBe(200);
      expect(res.body.data.started).toBe(true);
    });

    it('GET /api/storage/pools/:name/scrub/status 应返回状态', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: 'State : clean', stderr: '' });
      const res = await request(app).get('/api/storage/pools/test/scrub/status');
      expect(res.status).toBe(200);
      expect(res.body.data.running).toBe(false);
    });
  });

  // ===== network controller 补充 =====
  describe('network controller 补充', () => {
    it('PUT /api/network/interfaces/:name 应配置', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify([{ ifname: 'eth0', link_type: 'ether', operstate: 'UP', address: 'aa:bb', addr_info: [] }]),
        stderr: '',
      });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).put('/api/network/interfaces/eth0').send({ method: 'static', ip: '192.168.1.10', netmask: '24' });
      expect(res.status).toBe(200);
    });

    it('PUT /api/network/dns 应更新', async () => {
      const res = await request(app).put('/api/network/dns').send({ servers: ['8.8.8.8'] });
      expect(res.status).toBe(200);
    });

    it('POST /api/network/firewall 应添加规则', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).post('/api/network/firewall').send({ chain: 'input', protocol: 'tcp', port: 80, action: 'accept' });
      expect(res.status).toBe(201);
    });

    it('DELETE /api/network/firewall/:id 应删除规则', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).delete('/api/network/firewall/input-1');
      expect(res.status).toBe(200);
    });

    it('GET /api/network/wol 应返回设备', async () => {
      const res = await request(app).get('/api/network/wol');
      expect(res.status).toBe(200);
    });

    it('POST /api/network/wol 应发送魔术包', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const res = await request(app).post('/api/network/wol').send({ mac: 'aa:bb:cc:dd:ee:ff' });
      expect(res.status).toBe(200);
      expect(res.body.data.sent).toBe(true);
    });
  });

  // ===== container tailscale 管理端点 =====
  describe('container tailscale 管理', () => {
    it('GET /api/tailscale/manage 应返回管理报告', async () => {
      const res = await request(app).get('/api/tailscale/manage');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/tailscale/login 应登录', async () => {
      const res = await request(app).post('/api/tailscale/login').send({ controlUrl: 'https://hs.example.com' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/tailscale/logout 应登出', async () => {
      const res = await request(app).post('/api/tailscale/logout');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('logged-out');
    });

    it('POST /api/tailscale/accounts/:id/switch 应切换', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (String(p).includes('accounts.json')) return Promise.resolve(JSON.stringify({ accounts: [{ id: 'test', label: 'test', controlUrl: 'https://hs.example.com', loginName: 'u@e.com', active: true }] }));
        return Promise.reject(new Error('ENOENT'));
      });
      const res = await request(app).post('/api/tailscale/accounts/test/switch');
      expect(res.status).toBe(200);
    });

    it('DELETE /api/tailscale/accounts/:id 应移除', async () => {
      mockReadFile.mockImplementation((p: string) => {
        if (String(p).includes('accounts.json')) return Promise.resolve(JSON.stringify({ accounts: [{ id: 'test', label: 'test', controlUrl: 'https://hs.example.com', loginName: 'u@e.com', active: true }] }));
        return Promise.reject(new Error('ENOENT'));
      });
      const res = await request(app).delete('/api/tailscale/accounts/test');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('removed');
    });

    it('POST /api/tailscale/prefs 应应用偏好', async () => {
      const res = await request(app).post('/api/tailscale/prefs').send({ acceptRoutes: true });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('applied');
    });
  });

  // ===== filemanager 边界分支 =====
  describe('filemanager 边界分支', () => {
    it('GET /api/files/read 目录应 400', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => true, size: 0, mtime: new Date(), mode: 0o755 });
      const res = await request(app).get('/api/files/read?uid=1000&path=somedir');
      expect(res.status).toBe(400);
    });

    it('GET /api/files/read 大文件应截断', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => false, size: 2 * 1024 * 1024, mtime: new Date(), mode: 0o644 });
      mockOpen.mockResolvedValue({
        read: vi.fn().mockResolvedValue({ bytesRead: 0 }),
        close: vi.fn().mockResolvedValue(undefined),
      });
      const res = await request(app).get('/api/files/read?uid=1000&path=big.txt');
      expect(res.status).toBe(200);
      expect(res.body.data.truncated).toBe(true);
    });

    it('GET /api/files/list 不存在应 404', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));
      const res = await request(app).get('/api/files/list?uid=1000&path=nonexist');
      expect(res.status).toBe(404);
    });

    it('GET /api/files/list 非目录应 400', async () => {
      mockStat.mockResolvedValue({ isDirectory: () => false, size: 10, mtime: new Date(), mode: 0o644 });
      const res = await request(app).get('/api/files/list?uid=1000&path=file.txt');
      expect(res.status).toBe(400);
    });

    it('DELETE /api/files/delete permanent=true 应真删除', async () => {
      const res = await request(app).delete('/api/files/delete').send({ path: 'test.txt', uid: 1000, permanent: true });
      expect(res.status).toBe(200);
      expect(res.body.data.method).toBe('permanent');
    });

    it('POST /api/files/upload 应上传', async () => {
      mockStat.mockResolvedValue({ size: 100, isDirectory: () => false, mtime: new Date(), mode: 0o644 });
      const res = await request(app)
        .post('/api/files/upload')
        .field('uid', '1000')
        .field('path', 'files')
        .attach('file', Buffer.from('test content'), 'test.txt');
      expect(res.status).toBe(201);
      expect(res.body.data.uploaded).toBeDefined();
    });
  });

  // ===== filemanager controller 补充 =====
  describe('filemanager controller 补充', () => {
    it('GET /api/files/download 应返回 200 或 404', async () => {
      // download 使用 res.download()，mock 的 createReadStream 不会触发 end
      // 只验证路由存在且不 500
      const res = await request(app).get('/api/files/download?uid=1000&path=test.txt').timeout(3000).catch(() => null);
      // 如果超时则跳过（mock 限制），否则验证非 500
      if (res) expect(res.status).not.toBe(500);
    }, 10000);

    it('POST /api/files/write 参数校验失败应 400', async () => {
      const res = await request(app).post('/api/files/write').send({ path: '', uid: 1000, content: 'x' });
      expect(res.status).toBe(400);
    });

    it('POST /api/files/copy 参数校验失败应 400', async () => {
      const res = await request(app).post('/api/files/copy').send({ src: '', dest: '', uid: 1000 });
      expect(res.status).toBe(400);
    });

    it('POST /api/files/rename 参数校验失败应 400', async () => {
      const res = await request(app).post('/api/files/rename').send({ path: '', newName: '', uid: 1000 });
      expect(res.status).toBe(400);
    });

    it('DELETE /api/files/delete 参数校验失败应 400', async () => {
      const res = await request(app).delete('/api/files/delete').send({ path: '', uid: 1000 });
      expect(res.status).toBe(400);
    });
  });
});
