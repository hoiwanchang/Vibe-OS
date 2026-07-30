/**
 * 系统层：disk + network 单元测试
 * Mock command-executor 测试解析逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
vi.mock('../command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
}));

vi.mock('../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  COMMAND_TIMEOUT_MS: 5000,
}));

import { listBlockDevices, getDiskSmartInfo, getAllDiskHealth } from '../disk.js';
import { detectNetworkDrivers, getInterfaceInfo } from '../network.js';

describe('disk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listBlockDevices', () => {
    it('应解析 lsblk JSON 输出', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: JSON.stringify({
          blockdevices: [
            { name: 'sda', size: '1000204886016', type: 'disk', mountpoint: null, model: 'Samsung', serial: 'S123', tran: 'sata' },
            { name: 'sda1', size: '1000204886016', type: 'part', mountpoint: '/', model: null, serial: null, tran: null },
          ],
        }),
        stderr: '',
        exitCode: 0,
      });

      const devices = await listBlockDevices();
      expect(devices).toHaveLength(1); // 只返回 type=disk
      expect(devices[0]?.name).toBe('sda');
      expect(devices[0]?.model).toBe('Samsung');
    });

    it('命令失败应返回空数组', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });
      const devices = await listBlockDevices();
      expect(devices).toHaveLength(0);
    });
  });

  describe('getDiskSmartInfo', () => {
    it('应解析 SMART 健康状态', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: 'SMART overall-health self-assessment test result: PASSED', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            ata_smart_attributes: {
              table: [{ id: 5, name: 'Reallocated_Sector_Ct', value: 100, worst: 100, thresh: 36, raw: { value: 0 } }],
            },
            temperature: { current: 35 },
            power_on_time: { hours: 1200 },
          }),
          stderr: '',
          exitCode: 0,
        });

      const info = await getDiskSmartInfo('/dev/sda');
      expect(info.healthy).toBe(true);
      expect(info.temperature).toBe(35);
      expect(info.powerOnHours).toBe(1200);
      expect(info.attributes['Reallocated_Sector_Ct']?.raw).toBe(0);
    });
  });

  describe('getAllDiskHealth', () => {
    it('应聚合所有磁盘健康数据', async () => {
      // 第一次调用: lsblk
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: JSON.stringify({
          blockdevices: [{ name: 'sda', size: '1000', type: 'disk', mountpoint: null, model: 'Test', serial: 'T1', tran: 'sata' }],
        }),
        stderr: '',
        exitCode: 0,
      });
      // smartctl -H
      mockExecuteCommand.mockResolvedValueOnce({ stdout: 'PASSED', stderr: '', exitCode: 0 });
      // smartctl -A -j
      mockExecuteCommand.mockResolvedValueOnce({ stdout: '{}', stderr: '', exitCode: 0 });

      const results = await getAllDiskHealth();
      expect(results).toHaveLength(1);
      expect(results[0]?.device).toBe('/dev/sda');
    });
  });
});

describe('network', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectNetworkDrivers', () => {
    it('应检测已知网卡驱动', async () => {
      // lsmod
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: 'Module                  Size  Used by\nr8125               123456  0\nigc                  65432  0\n',
        stderr: '',
        exitCode: 0,
      });
      // lspci
      mockExecuteCommand.mockResolvedValueOnce({
        stdout: '03:00.0 Ethernet controller [0200]: Realtek Semiconductor Co., Ltd. RTL8125 [10ec:8125]\n',
        stderr: '',
        exitCode: 0,
      });
      // modinfo r8125
      mockExecuteCommand.mockResolvedValue({
        stdout: 'version: 9.012.00\nfirmware: rtl_nic/rtl8125a-3.fw\n',
        stderr: '',
        exitCode: 0,
      });

      const drivers = await detectNetworkDrivers();
      const r8125 = drivers.find((d) => d.driver === 'r8125');
      expect(r8125?.loaded).toBe(true);
      expect(r8125?.version).toBe('9.012.00');

      const igc = drivers.find((d) => d.driver === 'igc');
      expect(igc?.loaded).toBe(true);
    });
  });

  describe('getInterfaceInfo', () => {
    it('应解析 ethtool 输出', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: 'Speed: 2500Mb/s\nDuplex: Full\ndriver: r8125\nLink detected: yes\n',
        stderr: '',
        exitCode: 0,
      });

      const info = await getInterfaceInfo('eth0');
      expect(info.linkDetected).toBe(true);
      expect(info.speed).toBe('2500Mb/s');
      expect(info.duplex).toBe('Full');
      expect(info.driver).toBe('r8125');
    });

    it('命令失败应返回默认值', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'no device', exitCode: 1 });
      const info = await getInterfaceInfo('eth99');
      expect(info.linkDetected).toBe(false);
      expect(info.speed).toBeNull();
    });
  });
});
