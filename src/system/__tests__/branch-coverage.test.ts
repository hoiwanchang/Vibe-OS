/**
 * 系统层：分支覆盖补充测试
 * 覆盖 JSON 解析失败、可选参数、错误路径等分支
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();
vi.mock('../command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));

vi.mock('../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  COMMAND_TIMEOUT_MS: 5000,
}));

vi.mock('../filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { listBlockDevices, getDiskSmartInfo, getAllDiskHealth } from '../disk.js';
import { detectNetworkDrivers } from '../network.js';
import { deployContainer } from '../docker.js';
import { getTailscaleStatus, getSubnetRoutes } from '../tailscale.js';

describe('分支覆盖补充', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('disk 分支', () => {
    it('lsblk JSON 解析失败应返回空数组', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: 'not json', stderr: '', exitCode: 0 });
      const devices = await listBlockDevices();
      expect(devices).toHaveLength(0);
    });

    it('smartctl 属性 JSON 解析失败应返回基本健康状态', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'PASSED', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'invalid json', stderr: '', exitCode: 0 });
      const info = await getDiskSmartInfo('/dev/sda');
      expect(info.healthy).toBe(true);
      expect(info.temperature).toBeNull();
    });

    it('smartctl 属性命令失败应返回基本状态', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'FAILED', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'error', exitCode: 1 });
      const info = await getDiskSmartInfo('/dev/sda');
      expect(info.healthy).toBe(false);
    });

    it('getAllDiskHealth 中 smartctl 异常应返回降级结果', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ blockdevices: [{ name: 'sda', size: '100', type: 'disk' }] }),
          stderr: '', exitCode: 0,
        })
        .mockRejectedValueOnce(new Error('smartctl crashed'));
      const results = await getAllDiskHealth();
      expect(results).toHaveLength(1);
      expect(results[0]?.healthy).toBe(false);
      expect(results[0]?.rawOutput).toContain('无法读取');
    });

    it('lsblk 字段为 null 应安全处理', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: JSON.stringify({
          blockdevices: [{ name: 'sda', size: null, type: 'disk', mountpoint: null, model: null, serial: null, tran: null }],
        }),
        stderr: '', exitCode: 0,
      });
      const devices = await listBlockDevices();
      expect(devices[0]?.sizeBytes).toBe(0n);
      expect(devices[0]?.model).toBeNull();
    });
  });

  describe('network 分支', () => {
    it('lsmod 失败应返回空模块集', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: '', stderr: 'error', exitCode: 1 }) // lsmod
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // lspci
      const drivers = await detectNetworkDrivers();
      expect(drivers.every((d) => !d.loaded)).toBe(true);
    });

    it('modinfo 失败应返回 null 版本', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'Module\nr8125 123 0\n', stderr: '', exitCode: 0 }) // lsmod
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // lspci
        .mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 1 }); // modinfo
      const drivers = await detectNetworkDrivers();
      const r8125 = drivers.find((d) => d.driver === 'r8125');
      expect(r8125?.loaded).toBe(true);
      expect(r8125?.version).toBeNull();
    });
  });

  describe('docker 分支', () => {
    it('无可选参数应生成最小命令', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: 'id123\n', stderr: '', exitCode: 0 });
      const id = await deployContainer({ name: 'minimal', image: 'img:latest' });
      expect(id).toBe('id123');
      const args = mockExecuteCommandStrict.mock.calls[0]?.[1] as string[];
      expect(args).not.toContain('-p');
      expect(args).not.toContain('-e');
      expect(args).not.toContain('-v');
      expect(args).not.toContain('--memory');
      expect(args).not.toContain('--network');
    });

    it('network 参数应生效', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: 'id\n', stderr: '', exitCode: 0 });
      await deployContainer({ name: 'net', image: 'img', network: 'bridge' });
      const args = mockExecuteCommandStrict.mock.calls[0]?.[1] as string[];
      expect(args).toContain('--network');
      expect(args).toContain('bridge');
    });

    it('readonly volume 应加 :ro 后缀', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: 'id\n', stderr: '', exitCode: 0 });
      await deployContainer({
        name: 'vol', image: 'img',
        volumes: [{ host: '/data/a', container: '/b', readonly: true }],
      });
      const args = mockExecuteCommandStrict.mock.calls[0]?.[1] as string[];
      expect(args).toContain('/data/a:/b:ro');
    });
  });

  describe('tailscale 分支', () => {
    it('status JSON 解析失败应返回 Unknown', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: 'not json', stderr: '', exitCode: 0 });
      const status = await getTailscaleStatus();
      expect(status.backendState).toBe('Unknown');
      expect(status.error).toContain('解析失败');
    });

    it('Self 为 null 应安全处理', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: JSON.stringify({ BackendState: 'Running' }),
        stderr: '', exitCode: 0,
      });
      const status = await getTailscaleStatus();
      expect(status.self).toBeNull();
      expect(status.peers).toHaveLength(0);
    });

    it('subnet routes JSON 解析失败应返回空', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: 'bad json', stderr: '', exitCode: 0 });
      const routes = await getSubnetRoutes();
      expect(routes).toHaveLength(0);
    });

    it('subnet routes 命令失败应返回空', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'err', exitCode: 1 });
      const routes = await getSubnetRoutes();
      expect(routes).toHaveLength(0);
    });
  });
});
