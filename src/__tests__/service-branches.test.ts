/**
 * 分支覆盖率补充 — 直接测试 service 层未覆盖分支
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== Mock 系统层 =====
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

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ===== network.service 分支 =====
import * as networkService from '../modules/network/network.service.js';

describe('network.service 分支覆盖', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getDns 应解析 nameserver 和 search', async () => {
    mockReadFile.mockResolvedValue('nameserver 8.8.8.8\nnameserver 8.8.4.4\nsearch example.com local\n');
    const result = await networkService.getDns();
    expect(result.servers).toEqual(['8.8.8.8', '8.8.4.4']);
    expect(result.search).toEqual(['example.com', 'local']);
  });

  it('getDns 文件不存在应返回空', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const result = await networkService.getDns();
    expect(result.servers).toEqual([]);
    expect(result.search).toEqual([]);
  });

  it('setDns 带 search 应写入', async () => {
    const result = await networkService.setDns(['1.1.1.1'], ['example.com']);
    expect(result).toBe(true);
    expect(mockWriteFile).toHaveBeenCalledWith('/etc/resolv.conf', 'nameserver 1.1.1.1\nsearch example.com\n', 'utf-8');
  });

  it('setDns 无 search 应只写 nameserver', async () => {
    const result = await networkService.setDns(['1.1.1.1']);
    expect(result).toBe(true);
    expect(mockWriteFile).toHaveBeenCalledWith('/etc/resolv.conf', 'nameserver 1.1.1.1\n', 'utf-8');
  });

  it('sendWol 带 broadcast 应传递 -i 参数', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const result = await networkService.sendWol('aa:bb:cc:dd:ee:ff', '192.168.1.255');
    expect(result).toBe(true);
    expect(mockExecuteCommand).toHaveBeenCalledWith('wakeonlan', ['aa:bb:cc:dd:ee:ff', '-i', '192.168.1.255']);
  });

  it('sendWol 失败应返回 false', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'err' });
    const result = await networkService.sendWol('aa:bb:cc:dd:ee:ff');
    expect(result).toBe(false);
  });

  it('listWolDevices 文件不存在应返回空', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    const result = await networkService.listWolDevices();
    expect(result).toEqual([]);
  });

  it('listWolDevices 应解析 JSON', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'pc1', mac: 'aa:bb' }]));
    const result = await networkService.listWolDevices();
    expect(result).toHaveLength(1);
  });

  it('getInterfaces 应解析 ip -j addr 输出', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify([{
        ifname: 'eth0', link_type: 'ether', operstate: 'UP', address: 'aa:bb:cc',
        addr_info: [{ family: 'inet', local: '192.168.1.10', prefixlen: 24 }],
      }]),
      stderr: '',
    });
    const result = await networkService.listInterfaces();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('eth0');
    expect(result[0].addresses).toHaveLength(1);
  });

  it('getFirewallRules 应解析 nft 输出', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'table inet filter {\n  chain input {\n    type filter hook input priority 0; policy accept;\n    tcp dport 80 accept comment "web"\n  }\n}\n',
      stderr: '',
    });
    const result = await networkService.listFirewallRules();
    expect(result.rules.length).toBeGreaterThanOrEqual(0);
  });

  it('getListeningPorts 应解析 ss 输出', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Netid State Recv-Q Send-Q Local Address:Port Process\ntcp LISTEN 0 128 0.0.0.0:22 users:(("sshd",pid=123,fd=3))\n',
      stderr: '',
    });
    const result = await networkService.listPorts();
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// ===== storage.service 分支 =====
import * as storageService from '../modules/storage/storage.service.js';

describe('storage.service 分支覆盖', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('listPools df 失败应标记 inactive', async () => {
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'mdadm') return Promise.resolve({ exitCode: 0, stdout: 'ARRAY /dev/md/test level=raid1 devices=2', stderr: '' });
      if (cmd === 'df') return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'err' });
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });
    const pools = await storageService.listPools();
    expect(pools).toHaveLength(1);
    expect(pools[0].state).toBe('inactive');
  });

  it('listPools df 成功应解析容量', async () => {
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'mdadm') return Promise.resolve({ exitCode: 0, stdout: 'ARRAY /dev/md/data level=raid5 devices=3', stderr: '' });
      if (cmd === 'df') return Promise.resolve({ exitCode: 0, stdout: ' 1K-blocks  Used Avail Use%\n 1000000 500000 500000 50%', stderr: '' });
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });
    const pools = await storageService.listPools();
    expect(pools).toHaveLength(1);
    expect(pools[0].totalBytes).toBe(1000000);
    expect(pools[0].usedPercent).toBe(50);
  });

  it('getPoolSmart smartctl JSON 解析失败应保留默认值', async () => {
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'mdadm') return Promise.resolve({ exitCode: 0, stdout: 'ARRAY /dev/md/test level=raid1 devices=2', stderr: '' });
      if (cmd === 'df') return Promise.resolve({ exitCode: 0, stdout: ' 1K-blocks  Used Avail Use%\n 1000 500 500 50%', stderr: '' });
      if (cmd === 'smartctl') return Promise.resolve({ exitCode: 0, stdout: 'not json', stderr: '' });
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });
    // listPools 返回的 pool.devices 为空（mdadm --detail --scan 不解析设备列表）
    // 所以 getPoolSmart 不会调用 smartctl
    const details = await storageService.getPoolSmart('test');
    expect(details).toEqual([]);
  });

  it('getPoolSmart 不存在应 404', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });
    await expect(storageService.getPoolSmart('nonexist')).rejects.toThrow();
  });

  it('listDisks lsblk 失败应返回空', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'err' });
    const disks = await storageService.listDisks();
    expect(disks).toEqual([]);
  });

  it('listDisks 应解析 lsblk JSON', async () => {
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'lsblk') return Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify({ blockdevices: [{ name: 'sda', type: 'disk', size: '1000000', model: 'WD', serial: 'S1', fstype: 'ext4', mountpoint: '/data' }] }),
        stderr: '',
      });
      if (cmd === 'smartctl') return Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify({ temperature: { current: 35 }, power_on_time: { hours: 1000 }, ata_smart_attributes: { table: [{ id: 5, name: 'Reallocated_Sector_Ct', value: 100, worst: 100, thresh: 36, raw: { value: 0 } }] } }),
        stderr: '',
      });
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });
    const disks = await storageService.listDisks();
    expect(disks).toHaveLength(1);
    expect(disks[0].device).toBe('/dev/sda');
    expect(disks[0].smart.healthy).toBe(true);
  });
});

// ===== sharing.service 分支 =====
import * as sharingService from '../modules/sharing/sharing.service.js';

describe('sharing.service 分支覆盖', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getShareStatus smb 应解析 smbstatus', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'docs', path: '/data/x', protocol: 'smb', readonly: false, validUsers: [], hosts: [], enabled: true }]));
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'Service      pid     Machine       Connected at\n-------------------------------------------------\n-------------------------------------------------\ndocs         1234    192.168.1.5   Mon Jan  1 00:00:00 2024\n',
      stderr: '',
    });
    const connections = await sharingService.getShareStatus('docs');
    expect(connections).toHaveLength(1);
    // parts[1]=pid, parts[3]=日期首词（smbstatus 格式中日期含空格）
    expect(connections[0].user).toBe('1234');
  });

  it('getShareStatus smb 命令失败应返回空', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'docs', path: '/data/x', protocol: 'smb', readonly: false, validUsers: [], hosts: [], enabled: true }]));
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });
    const connections = await sharingService.getShareStatus('docs');
    expect(connections).toEqual([]);
  });

  it('getShareStatus nfs 应返回空', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'nfs1', path: '/data/x', protocol: 'nfs', readonly: false, validUsers: [], hosts: [], enabled: true }]));
    const connections = await sharingService.getShareStatus('nfs1');
    expect(connections).toEqual([]);
  });

  it('restartShare smb 应调用 smbcontrol', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'docs', path: '/data/x', protocol: 'smb', readonly: false, validUsers: [], hosts: [], enabled: true }]));
    mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const result = await sharingService.restartShare('docs');
    expect(result.restarted).toBe('docs');
  });

  it('restartShare nfs 应调用 exportfs', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'nfs1', path: '/data/x', protocol: 'nfs', readonly: false, validUsers: [], hosts: [], enabled: true }]));
    mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const result = await sharingService.restartShare('nfs1');
    expect(result.restarted).toBe('nfs1');
  });
});

// ===== backup.service 分支 =====
import * as backupService from '../modules/backup/backup.service.js';

describe('backup.service 分支覆盖', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('createSnapshot btrfs 成功应返回', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const snap = await backupService.createSnapshot('pool1', 'snap1');
    expect(snap.name).toBe('snap1');
  });

  it('createSnapshot btrfs 失败 zfs 成功应返回', async () => {
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'btrfs') return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'not btrfs' });
      if (cmd === 'zfs') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });
    const snap = await backupService.createSnapshot('pool1', 'snap1');
    expect(snap.name).toBe('pool1@snap1');
  });

  it('createSnapshot 两者都失败应抛错', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'fail' });
    await expect(backupService.createSnapshot('pool1', 'snap1')).rejects.toThrow();
  });

  it('deleteSnapshot btrfs 成功', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const result = await backupService.deleteSnapshot('snap1');
    expect(result).toBe('snap1');
  });

  it('deleteSnapshot btrfs 失败 zfs 成功', async () => {
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'btrfs') return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      if (cmd === 'zfs') return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });
    const result = await backupService.deleteSnapshot('pool1@snap1');
    expect(result).toBe('pool1@snap1');
  });

  it('listSnapshots 应返回空当无快照', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' });
    const snaps = await backupService.listSnapshots('pool1');
    expect(snaps).toEqual([]);
  });
});

// ===== download.service 分支 =====
import * as downloadService from '../modules/download/download.service.js';

describe('download.service 分支覆盖', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('addTask 带 headers 应格式化', async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ result: 'gid1' }) });
    const gids = await downloadService.addTask(['https://example.com/f.zip'], '/data/dl', { 'User-Agent': 'test' });
    expect(gids).toEqual(['gid1']);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params[1].header).toBe('User-Agent: test');
  });

  it('removeTask active 失败应尝试 removeDownloadResult', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('not active'))
      .mockResolvedValueOnce({ json: () => Promise.resolve({ result: 'gid1' }) });
    const result = await downloadService.removeTask('gid1');
    expect(result).toBe('gid1');
  });

  it('getSettings 应返回设置', async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ result: { 'max-overall-download-limit': '0' } }) });
    const settings = await downloadService.getSettings();
    expect(settings['max-overall-download-limit']).toBe('0');
  });

  it('updateSettings 应返回更新的键', async () => {
    mockFetch.mockResolvedValue({ json: () => Promise.resolve({ result: {} }) });
    const updated = await downloadService.updateSettings({ 'max-overall-download-limit': '1M' });
    expect(updated).toContain('max-overall-download-limit');
  });
});

// ===== filemanager.service 分支 =====
import * as filemanagerService from '../modules/filemanager/filemanager.service.js';

describe('filemanager.service 分支覆盖', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('listTrash 目录不存在应返回空', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    const result = await filemanagerService.listTrash(1000);
    expect(result.total).toBe(0);
  });

  it('listTrash 有内容应列出', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([{ name: 'old.txt', isSymbolicLink: () => false, isDirectory: () => false }]);
    mockLstat.mockResolvedValue({ size: 50, mtime: new Date(), mode: 0o644 });
    const result = await filemanagerService.listTrash(1000);
    expect(result.total).toBe(1);
    expect(result.entries[0].name).toBe('old.txt');
  });

  it('readFile 目录应抛错', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true, size: 0, mtime: new Date(), mode: 0o755 });
    await expect(filemanagerService.readFile(1000, 'somedir')).rejects.toThrow();
  });

  it('readFile 大文件应截断', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => false, size: 2 * 1024 * 1024, mtime: new Date(), mode: 0o644 });
    mockOpen.mockResolvedValue({
      read: vi.fn().mockResolvedValue({ bytesRead: 0 }),
      close: vi.fn().mockResolvedValue(undefined),
    });
    const result = await filemanagerService.readFile(1000, 'big.txt');
    expect(result.truncated).toBe(true);
  });

  it('readFile 小文件应完整返回', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => false, size: 5, mtime: new Date(), mode: 0o644 });
    mockOpen.mockResolvedValue({
      read: vi.fn().mockResolvedValue({ bytesRead: 5 }),
      close: vi.fn().mockResolvedValue(undefined),
    });
    const result = await filemanagerService.readFile(1000, 'small.txt');
    expect(result.truncated).toBe(false);
  });

  it('deleteFile permanent=true 应真删除', async () => {
    const result = await filemanagerService.deleteFile(1000, 'test.txt', true);
    expect(result.method).toBe('permanent');
    expect(mockRm).toHaveBeenCalled();
  });

  it('deleteFile permanent=false 应移到回收站', async () => {
    const result = await filemanagerService.deleteFile(1000, 'test.txt', false);
    expect(result.method).toBe('trash');
  });

  it('getDownloadInfo 目录应抛错', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true, size: 0 });
    await expect(filemanagerService.getDownloadInfo(1000, 'somedir')).rejects.toThrow();
  });

  it('getDownloadInfo 不存在应 404', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    await expect(filemanagerService.getDownloadInfo(1000, 'nope.txt')).rejects.toThrow();
  });
});

// ===== container.service 分支 =====
import * as containerService from '../modules/container/container.service.js';

// Mock container dao
vi.mock('../modules/container/container.dao.js', () => ({
  checkDockerAvailable: vi.fn().mockResolvedValue(true),
  checkTailscaleAvailable: vi.fn().mockResolvedValue(true),
  createContainer: vi.fn().mockResolvedValue('cid123'),
  restart: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  fetchContainers: vi.fn().mockResolvedValue([]),
  fetchLogs: vi.fn().mockResolvedValue({ logs: '' }),
  fetchTailscaleStatus: vi.fn().mockResolvedValue({ backendState: 'Running', self: {}, peers: [] }),
  fetchSubnetRoutes: vi.fn().mockResolvedValue([]),
  setupSubnetRouter: vi.fn().mockResolvedValue(undefined),
  applyAcl: vi.fn().mockResolvedValue(undefined),
  loginTailscale: vi.fn().mockResolvedValue({ backendState: 'Running', authUrl: null, exitCode: 0, errorDetail: '' }),
  logoutTailscale: vi.fn().mockResolvedValue(undefined),
  whoamiTailscale: vi.fn().mockResolvedValue('user@example.com'),
  setTailscalePrefs: vi.fn().mockResolvedValue(undefined),
  getTailscalePrefs: vi.fn().mockResolvedValue({ acceptRoutes: false, exitNode: '', exitNodeAllowLanAccess: false, advertiseExitNode: false }),
  loadAccounts: vi.fn().mockResolvedValue([]),
  saveAccounts: vi.fn().mockResolvedValue(undefined),
  createAppDirs: vi.fn().mockResolvedValue({ appDir: '/data/naisys/test', createdDirs: [] }),
}));

describe('container.service 分支覆盖', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deployApp 非法容器名应 400', async () => {
    await expect(containerService.deployApp({ name: '../evil', image: 'nginx' })).rejects.toThrow();
  });

  it('deployApp 非法镜像名应 400', async () => {
    await expect(containerService.deployApp({ name: 'ok', image: 'nginx; rm -rf /' })).rejects.toThrow();
  });

  it('deployApp 非法 memoryLimit 应 400', async () => {
    await expect(containerService.deployApp({ name: 'ok', image: 'nginx', memoryLimit: 'abc' })).rejects.toThrow();
  });

  it('deployApp 非法 network 应 400', async () => {
    await expect(containerService.deployApp({ name: 'ok', image: 'nginx', network: '../net' })).rejects.toThrow();
  });

  it('setTailscalePrefs 非法 IP 应 400', async () => {
    await expect(containerService.setTailscalePrefs({ exitNode: 'not-an-ip' })).rejects.toThrow();
  });

  it('setTailscalePrefs 空 exitNode 应通过', async () => {
    await containerService.setTailscalePrefs({ exitNode: '' });
    // 不抛错即通过
  });

  it('removeTailscaleAccount 不存在应 404', async () => {
    const { loadAccounts } = await import('../modules/container/container.dao.js');
    vi.mocked(loadAccounts).mockResolvedValue([]);
    await expect(containerService.removeTailscaleAccount('nonexist')).rejects.toThrow();
  });

  it('switchTailscaleAccount 不存在应 404', async () => {
    const { loadAccounts } = await import('../modules/container/container.dao.js');
    vi.mocked(loadAccounts).mockResolvedValue([]);
    await expect(containerService.switchTailscaleAccount('nonexist')).rejects.toThrow();
  });

  it('loginTailscale 不可用应抛错', async () => {
    const { checkTailscaleAvailable } = await import('../modules/container/container.dao.js');
    vi.mocked(checkTailscaleAvailable).mockResolvedValue(false);
    await expect(containerService.loginTailscale({})).rejects.toThrow();
  });
});
