/**
 * 模块：存储池管理 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../storage.service.js';
import { AppError } from '../../../common/app-error.js';

describe('存储池管理', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('listDisks', () => {
    it('应解析 lsblk 输出', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ blockdevices: [
          { name: 'sda', type: 'disk', size: '1000204886016', model: 'Samsung', serial: 'S123', fstype: null, mountpoint: null },
          { name: 'sda1', type: 'part', size: '500G', model: null, serial: null, fstype: 'ext4', mountpoint: '/' },
        ] }),
        stderr: '',
      });
      const disks = await service.listDisks();
      expect(disks).toHaveLength(1);
      expect(disks[0]?.device).toBe('/dev/sda');
      expect(disks[0]?.model).toBe('Samsung');
    });

    it('命令失败应返回空数组', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'err' });
      const disks = await service.listDisks();
      expect(disks).toEqual([]);
    });
  });

  describe('listPools', () => {
    it('应解析 mdadm 输出', async () => {
      mockExecuteCommand.mockImplementation((cmd: string) => {
        if (cmd === 'mdadm') return Promise.resolve({ exitCode: 0, stdout: 'ARRAY /dev/md/data level=raid5 devices=3', stderr: '' });
        return Promise.resolve({ exitCode: 0, stdout: ' 1K-blocks  Used Avail Use%\n 1000 500 500 50%', stderr: '' });
      });
      const pools = await service.listPools();
      expect(pools).toHaveLength(1);
      expect(pools[0]?.name).toBe('data');
      expect(pools[0]?.level).toBe('raid5');
    });

    it('无阵列应返回空', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const pools = await service.listPools();
      expect(pools).toEqual([]);
    });
  });

  describe('createPool', () => {
    it('应创建 RAID + 格式化 + 挂载', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: JSON.stringify({ blockdevices: [] }), stderr: '' });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const pool = await service.createPool('testpool', 'raid1', ['/dev/sdb', '/dev/sdc']);
      expect(pool.name).toBe('testpool');
      expect(pool.level).toBe('raid1');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('mdadm', expect.arrayContaining(['--create']), 300000);
    });

    it('系统盘应被拒绝', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ blockdevices: [{ name: 'sda', mountpoint: null, children: [{ mountpoint: '/' }] }] }),
        stderr: '',
      });
      await expect(service.createPool('bad', 'raid1', ['/dev/sda'])).rejects.toThrow(AppError);
    });
  });

  describe('destroyPool', () => {
    it('应卸载并停止阵列', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const result = await service.destroyPool('testpool');
      expect(result).toBe('testpool');
    });
  });

  describe('getScrubStatus', () => {
    it('应解析重建进度', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: 'Rebuild Status : 42% complete', stderr: '' });
      const status = await service.getScrubStatus('data');
      expect(status.running).toBe(true);
      expect(status.progress).toBe(42);
    });

    it('无重建应返回 not running', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: 'State : clean', stderr: '' });
      const status = await service.getScrubStatus('data');
      expect(status.running).toBe(false);
    });
  });
});
