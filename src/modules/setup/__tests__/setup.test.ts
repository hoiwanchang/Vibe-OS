/**
 * 模块：安装向导 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const mockAccess = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

const mockExecuteCommand = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
}));

vi.mock('../../../system/filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

import { createApp } from '../../../app.js';

describe('安装向导 API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  });

  it('GET /api/setup/status 未初始化', async () => {
    const res = await request(app).get('/api/setup/status');
    expect(res.status).toBe(200);
    expect(res.body.data.initialized).toBe(false);
  });

  it('GET /api/setup/status 已初始化', async () => {
    mockAccess.mockResolvedValue(undefined);
    const res = await request(app).get('/api/setup/status');
    expect(res.status).toBe(200);
    expect(res.body.data.initialized).toBe(true);
  });

  it('GET /api/setup/disks 应返回磁盘列表', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: '/dev/sda 1000204886016 Samsung SSD 870\n/dev/sdb 2000398934016 WDC WD20EZAZ-00G\n',
      stderr: '',
    });
    const res = await request(app).get('/api/setup/disks');
    expect(res.status).toBe(200);
    expect(res.body.data.disks).toHaveLength(2);
    expect(res.body.data.disks[0].name).toBe('sda');
    expect(res.body.data.disks[0].size).toBe('932 GB');
  });

  it('GET /api/setup/disks 应过滤 loop 设备', async () => {
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: '/dev/loop0 104857600 \n/dev/sda 500107862016 Kingston\n',
      stderr: '',
    });
    const res = await request(app).get('/api/setup/disks');
    expect(res.body.data.disks).toHaveLength(1);
    expect(res.body.data.disks[0].name).toBe('sda');
  });

  it('GET /api/setup/disks lsblk 失败应返回空', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });
    const res = await request(app).get('/api/setup/disks');
    expect(res.body.data.disks).toEqual([]);
  });

  it('POST /api/setup/complete 应完成初始化', async () => {
    const res = await request(app)
      .post('/api/setup/complete')
      .send({
        admin: { username: 'admin', password: 'password123', enable2fa: false },
        storage: { disks: ['sda'], poolType: 'single', filesystem: 'ext4' },
        network: { method: 'dhcp' },
        services: { smb: true, ftp: false, dlna: true, docker: false },
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/setup/complete 静态网络应配置 IP', async () => {
    const res = await request(app)
      .post('/api/setup/complete')
      .send({
        admin: { username: 'admin', password: 'password123', enable2fa: false },
        storage: { disks: ['sda'], poolType: 'single', filesystem: 'ext4' },
        network: { method: 'static', ip: '192.168.1.100', netmask: '24', gateway: '192.168.1.1' },
        services: { smb: true, ftp: false, dlna: false, docker: false },
      });
    expect(res.status).toBe(201);
    expect(mockExecuteCommand).toHaveBeenCalledWith('ip', ['addr', 'add', '192.168.1.100/24', 'dev', 'eth0']);
    expect(mockExecuteCommand).toHaveBeenCalledWith('ip', ['route', 'add', 'default', 'via', '192.168.1.1']);
  });

  it('POST /api/setup/complete 已初始化应 409', async () => {
    mockAccess.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/setup/complete')
      .send({
        admin: { username: 'admin', password: 'password123', enable2fa: false },
        storage: { disks: ['sda'], poolType: 'single', filesystem: 'ext4' },
        network: { method: 'dhcp' },
        services: { smb: true, ftp: false, dlna: false, docker: false },
      });
    expect(res.status).toBe(409);
  });
});
