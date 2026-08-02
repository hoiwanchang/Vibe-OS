/**
 * 模块：RAID 阵列管理 — 单元测试
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
  VIBEOS_APP_DIR: '/data/vibeos',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../raid.service.js';
import { AppError } from '../../../common/app-error.js';

/** 构造 mdadm --detail 输出 */
function makeDetailOutput(overrides: { state?: string; rebuild?: string; level?: string; size?: string } = {}): string {
  const state = overrides.state ?? 'clean';
  const rebuild = overrides.rebuild ?? '';
  const level = overrides.level ?? 'raid5';
  const size = overrides.size ?? '1953254400';
  return [
    `/dev/md/data:`,
    `        Version : 1.2`,
    `  Creation Time : Fri Jan  1 00:00:00 2026`,
    `     Raid Level : ${level}`,
    `     Array Size : ${size} (1862.75 GiB 2000.13 GB)`,
    `      State : ${state}`,
    rebuild ? ` Rebuild Status : ${rebuild}` : '',
    `    Number   Major   Minor   RaidDevice State`,
    `       0       8       16        0      active sync   /dev/sdb`,
    `       1       8       32        1      active sync   /dev/sdc`,
    `       2       8       48        -      spare   /dev/sdd`,
  ].filter(Boolean).join('\n');
}

describe('RAID 阵列管理', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('listArrays', () => {
    it('应解析 mdadm --detail --scan 输出并获取状态', async () => {
      mockExecuteCommand.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'mdadm' && args.includes('--scan')) {
          return Promise.resolve({
            exitCode: 0,
            stdout: 'ARRAY /dev/md/data level=raid5 num-devices=3 metadata=1.2 name=host:data UUID=xxx\n',
            stderr: '',
          });
        }
        // --detail /dev/md/data
        return Promise.resolve({ exitCode: 0, stdout: makeDetailOutput({ state: 'clean' }), stderr: '' });
      });

      const arrays = await service.listArrays();
      expect(arrays).toHaveLength(1);
      expect(arrays[0]?.name).toBe('data');
      expect(arrays[0]?.level).toBe('raid5');
      expect(arrays[0]?.state).toBe('online');
      expect(arrays[0]?.deviceCount).toBe(3);
    });

    it('无阵列应返回空数组', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const arrays = await service.listArrays();
      expect(arrays).toEqual([]);
    });

    it('命令失败应返回空数组', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'err' });
      const arrays = await service.listArrays();
      expect(arrays).toEqual([]);
    });

    it('detail 查询失败应标记为 inactive', async () => {
      mockExecuteCommand.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'mdadm' && args.includes('--scan')) {
          return Promise.resolve({
            exitCode: 0,
            stdout: 'ARRAY /dev/md/broken level=raid1 num-devices=2\n',
            stderr: '',
          });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'not found' });
      });

      const arrays = await service.listArrays();
      expect(arrays[0]?.state).toBe('inactive');
    });
  });

  describe('getArrayDetail', () => {
    it('应解析阵列详情（成员盘、热备、容量、状态）', async () => {
      mockExecuteCommand.mockImplementation((cmd: string, _args: string[]) => {
        if (cmd === 'mdadm') {
          return Promise.resolve({ exitCode: 0, stdout: makeDetailOutput({ state: 'clean', level: 'raid5' }), stderr: '' });
        }
        // df
        return Promise.resolve({ exitCode: 0, stdout: '  Used Avail\n 500 500', stderr: '' });
      });

      const detail = await service.getArrayDetail('data');
      expect(detail.name).toBe('data');
      expect(detail.device).toBe('/dev/md/data');
      expect(detail.level).toBe('raid5');
      expect(detail.state).toBe('online');
      expect(detail.devices).toEqual(['/dev/sdb', '/dev/sdc']);
      expect(detail.spares).toEqual(['/dev/sdd']);
      expect(detail.totalBytes).toBe(1953254400 * 1024);
      expect(detail.syncProgress).toBeNull();
    });

    it('应解析重建进度', async () => {
      mockExecuteCommand.mockImplementation((cmd: string) => {
        if (cmd === 'mdadm') {
          return Promise.resolve({ exitCode: 0, stdout: makeDetailOutput({ state: 'degraded', rebuild: '42% complete' }), stderr: '' });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      });

      const detail = await service.getArrayDetail('data');
      expect(detail.state).toBe('rebuilding');
      expect(detail.syncProgress).toBe(42);
    });

    it('阵列不存在应抛出 404', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'not found' });
      await expect(service.getArrayDetail('ghost')).rejects.toThrow(AppError);
    });
  });

  describe('createArray', () => {
    it('应创建阵列并返回详情', async () => {
      mockExecuteCommand.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'mdadm' && args.includes('--scan')) {
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }
        // getArrayDetail 的 --detail 调用
        return Promise.resolve({ exitCode: 0, stdout: makeDetailOutput({ level: 'raid1' }), stderr: '' });
      });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      const detail = await service.createArray('newpool', 'raid1', ['/dev/sdb', '/dev/sdc']);
      expect(detail.name).toBe('newpool');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith(
        'mdadm',
        expect.arrayContaining(['--create', '/dev/md/newpool', '--level=raid1', '--raid-devices=2']),
        300000,
      );
    });

    it('应支持热备盘', async () => {
      mockExecuteCommand.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'mdadm' && args.includes('--scan')) {
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }
        return Promise.resolve({ exitCode: 0, stdout: makeDetailOutput(), stderr: '' });
      });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      await service.createArray('sp', 'raid5', ['/dev/sdb', '/dev/sdc', '/dev/sdd'], ['/dev/sde']);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith(
        'mdadm',
        expect.arrayContaining(['--spare-devices=1', '/dev/sde']),
        300000,
      );
    });

    it('阵列已存在应抛出 409', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'ARRAY /dev/md/data level=raid5 num-devices=3\n',
        stderr: '',
      });

      await expect(service.createArray('data', 'raid5', ['/dev/sdb'])).rejects.toThrow(AppError);
    });
  });

  describe('addDevice', () => {
    it('应向阵列添加磁盘', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: makeDetailOutput(), stderr: '' });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      const detail = await service.addDevice('data', '/dev/sde');
      expect(detail.name).toBe('data');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('mdadm', ['--add', '/dev/md/data', '/dev/sde']);
    });

    it('阵列不存在应抛出 404', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'err' });
      await expect(service.addDevice('ghost', '/dev/sde')).rejects.toThrow(AppError);
    });
  });

  describe('removeDevice', () => {
    it('应先 fail 再 remove 磁盘', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: makeDetailOutput(), stderr: '' });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      await service.removeDevice('data', '/dev/sdc');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('mdadm', ['--manage', '/dev/md/data', '--fail', '/dev/sdc']);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('mdadm', ['--manage', '/dev/md/data', '--remove', '/dev/sdc']);
    });
  });

  describe('rebuildArray', () => {
    it('应触发 repair 重建', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: makeDetailOutput(), stderr: '' });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      const result = await service.rebuildArray('data');
      expect(result.started).toBe(true);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('mdadm', ['--action', 'repair', '/dev/md/data']);
    });

    it('阵列不存在应抛出 404', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'err' });
      await expect(service.rebuildArray('ghost')).rejects.toThrow(AppError);
    });
  });

  describe('deleteArray', () => {
    it('应卸载、停止阵列并擦除超级块', async () => {
      mockExecuteCommand.mockImplementation((cmd: string) => {
        if (cmd === 'mdadm') {
          return Promise.resolve({ exitCode: 0, stdout: makeDetailOutput(), stderr: '' });
        }
        // umount / wipefs
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      });
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

      const result = await service.deleteArray('data');
      expect(result.deleted).toBe(true);
      expect(result.name).toBe('data');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('mdadm', ['--stop', '/dev/md/data']);
      // wipefs 应被调用（对成员盘 + 热备盘）
      expect(mockExecuteCommand).toHaveBeenCalledWith('wipefs', ['--all', '/dev/sdb']);
      expect(mockExecuteCommand).toHaveBeenCalledWith('wipefs', ['--all', '/dev/sdd']);
    });

    it('阵列不存在应抛出 404', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'err' });
      await expect(service.deleteArray('ghost')).rejects.toThrow(AppError);
    });
  });
});
