/**
 * 分支覆盖率最终补充 — 针对剩余未覆盖分支
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  NAISYS_APP_DIR: '/data/naisys',
  SECRETS_DIR: '/data/naisys/secrets',
  SYSTEM_CACHE_DIR: '/data/naisys/cache',
  USER_SUBDIRS: ['files', 'config', 'cache'],
  DEFAULT_QUOTA_BYTES: 10737418240,
  COMMAND_TIMEOUT_MS: 5000,
  PORT: 3000,
  HOST: '127.0.0.1',
  API_TOKEN: '',
}));

// ===== network.service 剩余分支 =====
import * as networkService from '../modules/network/network.service.js';

describe('network.service 剩余分支', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('listInterfaces ip 命令失败应返回空', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'err' });
    const result = await networkService.listInterfaces();
    expect(result).toEqual([]);
  });

  it('configureInterface static 带 gateway', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify([{ ifname: 'eth0', link_type: 'ether', operstate: 'UP', address: 'aa:bb', addr_info: [{ family: 'inet', local: '192.168.1.10', prefixlen: 24 }] }]),
      stderr: '',
    });
    const result = await networkService.configureInterface('eth0', { method: 'static', ip: '192.168.1.10', netmask: '24', gateway: '192.168.1.1' });
    expect(result.name).toBe('eth0');
    expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['route', 'add', 'default', 'via', '192.168.1.1']);
  });

  it('configureInterface static 无 gateway', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify([{ ifname: 'eth0', link_type: 'ether', operstate: 'UP', address: 'aa:bb', addr_info: [] }]),
      stderr: '',
    });
    const result = await networkService.configureInterface('eth0', { method: 'static', ip: '10.0.0.5' });
    expect(result.name).toBe('eth0');
  });

  it('configureInterface dhcp', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify([{ ifname: 'eth0', link_type: 'ether', operstate: 'UP', address: 'aa:bb', addr_info: [] }]),
      stderr: '',
    });
    const result = await networkService.configureInterface('eth0', { method: 'dhcp' });
    expect(result.name).toBe('eth0');
    expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['link', 'set', 'eth0', 'up']);
  });

  it('configureInterface 接口不存在应 404', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: JSON.stringify([]), stderr: '' });
    await expect(networkService.configureInterface('eth99', { method: 'dhcp' })).rejects.toThrow();
  });

  it('listFirewallRules nft 失败应返回默认', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });
    const result = await networkService.listFirewallRules();
    expect(result.rules).toEqual([]);
  });

  it('listPorts ss 失败应返回空', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });
    const result = await networkService.listPorts();
    expect(result).toEqual([]);
  });
});

// ===== filemanager.service 剩余分支 =====
import * as filemanagerService from '../modules/filemanager/filemanager.service.js';

describe('filemanager.service 剩余分支', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('listDirectory lstat 失败应跳过条目', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true, size: 0, mtime: new Date(), mode: 0o755 });
    mockReaddir.mockResolvedValue([
      { name: 'good.txt', isSymbolicLink: () => false, isDirectory: () => false },
      { name: 'bad.txt', isSymbolicLink: () => false, isDirectory: () => false },
    ]);
    mockLstat
      .mockResolvedValueOnce({ size: 10, mtime: new Date(), mode: 0o644 })
      .mockRejectedValueOnce(new Error('EACCES'));
    const result = await filemanagerService.listDir(1000, '');
    expect(result.total).toBe(1);
    expect(result.entries[0].name).toBe('good.txt');
  });

  it('copyFile 源不存在应 404', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    await expect(filemanagerService.copyFile(1000, 'nope.txt', 'dest.txt')).rejects.toThrow();
  });

  it('listTrash lstat 失败应跳过', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([
      { name: 'ok.txt', isSymbolicLink: () => false, isDirectory: () => false },
      { name: 'err.txt', isSymbolicLink: () => false, isDirectory: () => false },
    ]);
    mockLstat
      .mockResolvedValueOnce({ size: 5, mtime: new Date(), mode: 0o644 })
      .mockRejectedValueOnce(new Error('EACCES'));
    const result = await filemanagerService.listTrash(1000);
    expect(result.total).toBe(1);
  });

  it('listDirectory symlink 应标记类型', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true, size: 0, mtime: new Date(), mode: 0o755 });
    mockReaddir.mockResolvedValue([
      { name: 'link', isSymbolicLink: () => true, isDirectory: () => false },
    ]);
    mockLstat.mockResolvedValue({ size: 0, mtime: new Date(), mode: 0o777 });
    const result = await filemanagerService.listDir(1000, '');
    expect(result.entries[0].type).toBe('symlink');
  });
});

// ===== hardware.service 剩余分支 =====

describe('hardware.service 剩余分支', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getDiskHealthReport 应合并 SMART 和 lsblk 元数据', async () => {
    // Mock getAllDiskHealth
    vi.mock('../system/disk.js', () => ({
      getAllDiskHealth: vi.fn().mockResolvedValue([
        { device: '/dev/sda', healthy: true, temperature: 35, powerOnHours: 1000 },
      ]),
      listBlockDevices: vi.fn().mockResolvedValue([]),
      getDiskSmartInfo: vi.fn().mockResolvedValue(null),
    }));
    // 需要重新导入以获取 mock
    const { getDiskHealthReport } = await import('../modules/hardware/hardware.service.js');
    const report = await getDiskHealthReport();
    expect(report.disks).toHaveLength(1);
    expect(report.disks[0].healthy).toBe(true);
  });
});

// ===== backup.service 剩余分支 =====
import * as backupService from '../modules/backup/backup.service.js';

describe('backup.service 剩余分支', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('runJob rsync 应解析传输统计', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'j1', name: 'test', source: '/data/1', target: '/bak', type: 'rsync', schedule: null, enabled: true, lastRun: null, lastStatus: null }]));
    mockExecuteCommandStrict.mockResolvedValue({
      exitCode: 0,
      stdout: 'Number of regular files transferred: 10\nTotal transferred file size: 5000',
      stderr: '',
    });
    const exec = await backupService.runJob('j1');
    expect(exec.status).toBe('success');
    expect(exec.filesTransferred).toBe(10);
    expect(exec.bytesTransferred).toBe(5000);
  });

  it('runJob 失败应记录错误', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'j1', name: 'test', source: '/data/1', target: '/bak', type: 'rsync', schedule: null, enabled: true, lastRun: null, lastStatus: null }]));
    mockExecuteCommandStrict.mockRejectedValue(new Error('rsync error: connection refused'));
    const exec = await backupService.runJob('j1');
    expect(exec.status).toBe('failed');
    expect(exec.error).toContain('rsync error');
  });

  it('runJob 不存在应 404', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([]));
    await expect(backupService.runJob('nonexist')).rejects.toThrow();
  });
});

// ===== notification.service 剩余分支 =====
import * as notificationService from '../modules/notification/notification.service.js';

describe('notification.service 剩余分支', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('emit webhook 失败不应阻塞', async () => {
    // loadSettings 读取 /data/naisys/notification/settings.json
    mockReadFile.mockImplementation((p: string) => {
      if (String(p).includes('settings.json')) return Promise.resolve(JSON.stringify([{ type: 'webhook', enabled: true, url: 'http://hook.test', minSeverity: 'info' }]));
      if (String(p).includes('notifications.json')) return Promise.resolve(JSON.stringify([]));
      return Promise.reject(new Error('ENOENT'));
    });
    const mockFetchLocal = vi.fn().mockRejectedValue(new Error('network error'));
    vi.stubGlobal('fetch', mockFetchLocal);
    const n = await notificationService.emit('info', 'system', 'test', 'detail');
    expect(n.id).toBeDefined();
    expect(mockFetchLocal).toHaveBeenCalledTimes(1);
  });

  it('emit severity 低于阈值不应推送', async () => {
    mockReadFile.mockImplementation((p: string) => {
      if (String(p).includes('settings.json')) return Promise.resolve(JSON.stringify([{ type: 'webhook', enabled: true, url: 'http://hook.test', minSeverity: 'critical' }]));
      if (String(p).includes('notifications.json')) return Promise.resolve(JSON.stringify([]));
      return Promise.reject(new Error('ENOENT'));
    });
    const mockFetchLocal = vi.fn();
    vi.stubGlobal('fetch', mockFetchLocal);
    await notificationService.emit('info', 'system', 'test', 'detail');
    expect(mockFetchLocal).not.toHaveBeenCalled();
  });
});

// ===== scheduler.service 剩余分支 =====
import * as schedulerService from '../modules/scheduler/scheduler.service.js';

describe('scheduler.service 剩余分支', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('runJob 非零退出码应标记失败', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'j1', name: 'test', command: 'exit 1', schedule: '* * * * *', enabled: true, lastRun: null, lastStatus: null, nextRun: null }]));
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'command failed' });
    const exec = await schedulerService.runJob('j1');
    expect(exec.status).toBe('failed');
    expect(exec.exitCode).toBe(1);
  });

  it('runJob stdout 超 10KB 应截断', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ id: 'j1', name: 'test', command: 'echo big', schedule: '* * * * *', enabled: true, lastRun: null, lastStatus: null, nextRun: null }]));
    const bigOutput = 'x'.repeat(20 * 1024);
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: bigOutput, stderr: '' });
    const exec = await schedulerService.runJob('j1');
    expect(exec.stdout.length).toBeLessThanOrEqual(10 * 1024 + 20);
  });

  it('createJob 危险命令应 403', async () => {
    await expect(schedulerService.createJob({ name: 'bad', command: 'mkfs.ext4 /dev/sda', schedule: '* * * * *' })).rejects.toThrow();
  });

  it('createJob dd 命令应 403', async () => {
    await expect(schedulerService.createJob({ name: 'bad', command: 'dd if=/dev/zero of=/dev/sda', schedule: '* * * * *' })).rejects.toThrow();
  });
});
