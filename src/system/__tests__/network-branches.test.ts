/**
 * 系统层：network.ts 分支覆盖测试
 * Mock command-executor，直接测试网卡检测封装的全部分支
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();

vi.mock('../command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
}));

import {
  getLoadedModules,
  getPciNetworkDevices,
  detectNetworkDrivers,
  getInterfaceInfo,
} from '../network.js';

describe('system/network 分支覆盖', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLoadedModules', () => {
    it('exitCode=0 解析模块列表', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: 'Module                  Size  Used by\nr8125                 1234  0\nigc                   5678  0\n',
        stderr: '',
        exitCode: 0,
      });
      const modules = await getLoadedModules();
      expect(modules.has('r8125')).toBe(true);
      expect(modules.has('igc')).toBe(true);
      expect(modules.size).toBe(2);
    });

    it('exitCode!=0 返回空集合', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'err', exitCode: 1 });
      const modules = await getLoadedModules();
      expect(modules.size).toBe(0);
    });

    it('空行被跳过（name 为空）', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: 'Module\n\nr8125\n',
        stderr: '',
        exitCode: 0,
      });
      const modules = await getLoadedModules();
      expect(modules.has('r8125')).toBe(true);
      expect(modules.size).toBe(1);
    });
  });

  describe('getPciNetworkDevices', () => {
    it('exitCode=0 过滤 Ethernet/Network 设备', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: [
          '03:00.0 Ethernet controller [0200]: Realtek RTL8125 [10ec:8125]',
          '00:02.0 VGA compatible controller [0300]: Intel UHD',
          '04:00.0 Network controller [0280]: Intel Wi-Fi 6',
        ].join('\n'),
        stderr: '',
        exitCode: 0,
      });
      const devices = await getPciNetworkDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0]?.slot).toBe('03:00.0');
      expect(devices[1]?.slot).toBe('04:00.0');
    });

    it('exitCode!=0 返回空数组', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'err', exitCode: 1 });
      const devices = await getPciNetworkDevices();
      expect(devices).toEqual([]);
    });
  });

  describe('detectNetworkDrivers', () => {
    it('已加载驱动：获取 version + firmware', async () => {
      // 第一次调用 lsmod
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: 'Module\nr8125\n',
        stderr: '',
        exitCode: 0,
      });
      // 第二次调用 lspci
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: '03:00.0 Ethernet controller: Realtek RTL8125',
        stderr: '',
        exitCode: 0,
      });
      // 后续 modinfo 调用（每个已知驱动一次，但只有 r8125 已加载）
      mockExecuteCommand.mockResolvedValue({
        stdout: 'version: 9.012.00\nfirmware: rtl8125/fw.bin\n',
        stderr: '',
        exitCode: 0,
      });

      const results = await detectNetworkDrivers();
      const r8125 = results.find((r) => r.driver === 'r8125');
      expect(r8125?.loaded).toBe(true);
      expect(r8125?.version).toBe('9.012.00');
      expect(r8125?.firmware).toBe('rtl8125/fw.bin');
      expect(r8125?.pciDevices.length).toBe(1);
    });

    it('已加载但 modinfo 失败：version/firmware 为 null', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: 'Module\nigc\n',
        stderr: '',
        exitCode: 0,
      });
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
      // modinfo 失败
      mockExecuteCommand.mockResolvedValue({
        stdout: '',
        stderr: 'modinfo: not found',
        exitCode: 1,
      });

      const results = await detectNetworkDrivers();
      const igc = results.find((r) => r.driver === 'igc');
      expect(igc?.loaded).toBe(true);
      expect(igc?.version).toBeNull();
      expect(igc?.firmware).toBeNull();
    });

    it('未加载驱动：不调用 modinfo', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: 'Module\n',
        stderr: '',
        exitCode: 0,
      });
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const results = await detectNetworkDrivers();
      // 所有驱动都未加载
      expect(results.every((r) => !r.loaded)).toBe(true);
      expect(results.every((r) => r.version === null)).toBe(true);
    });

    it('modinfo 输出无 version/firmware 行', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: 'Module\ne1000e\n',
        stderr: '',
        exitCode: 0,
      });
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
      mockExecuteCommand.mockResolvedValue({
        stdout: 'filename: /lib/modules/e1000e.ko\nlicense: GPL\n',
        stderr: '',
        exitCode: 0,
      });

      const results = await detectNetworkDrivers();
      const e1000e = results.find((r) => r.driver === 'e1000e');
      expect(e1000e?.loaded).toBe(true);
      expect(e1000e?.version).toBeNull();
      expect(e1000e?.firmware).toBeNull();
    });
  });

  describe('getInterfaceInfo', () => {
    it('exitCode!=0 返回默认值', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'err', exitCode: 1 });
      const info = await getInterfaceInfo('eth0');
      expect(info.linkDetected).toBe(false);
      expect(info.speed).toBeNull();
      expect(info.duplex).toBeNull();
      expect(info.driver).toBeNull();
    });

    it('完整 ethtool 输出', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: [
          'Settings for eth0:',
          '  Link detected: yes',
          '  Speed: 2500Mb/s',
          '  Duplex: Full',
          '  driver: r8125',
        ].join('\n'),
        stderr: '',
        exitCode: 0,
      });
      const info = await getInterfaceInfo('eth0');
      expect(info.linkDetected).toBe(true);
      expect(info.speed).toBe('2500Mb/s');
      expect(info.duplex).toBe('Full');
      expect(info.driver).toBe('r8125');
    });

    it('无 Speed/Duplex/driver 行', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: 'Settings for eth0:\n  Link detected: no\n',
        stderr: '',
        exitCode: 0,
      });
      const info = await getInterfaceInfo('eth0');
      expect(info.linkDetected).toBe(false);
      expect(info.speed).toBeNull();
      expect(info.duplex).toBeNull();
      expect(info.driver).toBeNull();
    });
  });
});
