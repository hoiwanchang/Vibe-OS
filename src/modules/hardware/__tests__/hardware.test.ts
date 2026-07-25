/**
 * 模块2：硬件健康与驱动状态监控 — 单元测试
 * Mock 系统层 disk/network 模块
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 系统层
vi.mock('../../../system/disk.js', () => ({
  getAllDiskHealth: vi.fn().mockResolvedValue([
    {
      device: '/dev/sda',
      healthy: true,
      temperature: 35,
      powerOnHours: 1200,
      attributes: {
        Reallocated_Sector_Ct: { value: 100, worst: 100, thresh: 36, raw: 0 },
      },
      rawOutput: 'SMART overall-health PASSED',
    },
    {
      device: '/dev/nvme0n1',
      healthy: false,
      temperature: 55,
      powerOnHours: 8000,
      attributes: {},
      rawOutput: 'SMART overall-health FAILED',
    },
  ]),
  listBlockDevices: vi.fn().mockResolvedValue([
    {
      name: 'sda',
      sizeBytes: 1000204886016n,
      type: 'disk',
      mountPoint: null,
      model: 'Samsung SSD 870',
      serial: 'S12345',
      transport: 'sata',
    },
    {
      name: 'nvme0n1',
      sizeBytes: 512110190592n,
      type: 'disk',
      mountPoint: '/',
      model: 'WD SN770',
      serial: 'W67890',
      transport: 'nvme',
    },
  ]),
}));

vi.mock('../../../system/network.js', () => ({
  detectNetworkDrivers: vi.fn().mockResolvedValue([
    {
      driver: 'r8125',
      vendor: 'Realtek',
      product: 'RTL8125 (2.5GbE)',
      loaded: true,
      version: '9.012.00',
      firmware: null,
      pciDevices: ['03:00.0 Ethernet controller: Realtek RTL8125'],
    },
    {
      driver: 'igc',
      vendor: 'Intel',
      product: 'i225/i226 (2.5GbE)',
      loaded: false,
      version: null,
      firmware: null,
      pciDevices: [],
    },
    {
      driver: 'mlx5_core',
      vendor: 'Mellanox',
      product: 'ConnectX-4/5/6',
      loaded: false,
      version: null,
      firmware: null,
      pciDevices: [],
    },
  ]),
  getInterfaceInfo: vi.fn().mockResolvedValue({
    name: 'eth0',
    linkDetected: true,
    speed: '2500Mb/s',
    duplex: 'Full',
    driver: 'r8125',
  }),
}));

vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn().mockResolvedValue({
    stdout: '2: eth0: <BROADCAST,MULTICAST,UP> mtu 1500\n',
    stderr: '',
    exitCode: 0,
  }),
}));

import * as service from '../hardware.service.js';
import * as dao from '../hardware.dao.js';

describe('模块2：硬件健康与驱动状态监控', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDiskHealthReport', () => {
    it('应返回磁盘健康综合报告', async () => {
      const report = await service.getDiskHealthReport();

      expect(report.totalDisks).toBe(2);
      expect(report.healthyDisks).toBe(1);
      expect(report.disks).toHaveLength(2);
      expect(report.timestamp).toBeTruthy();
    });

    it('应正确合并块设备元信息', async () => {
      const report = await service.getDiskHealthReport();

      const sda = report.disks.find((d) => d.device === '/dev/sda');
      expect(sda?.model).toBe('Samsung SSD 870');
      expect(sda?.serial).toBe('S12345');
      expect(sda?.transport).toBe('sata');
      expect(sda?.temperature).toBe(35);
    });

    it('应正确标识不健康磁盘', async () => {
      const report = await service.getDiskHealthReport();

      const nvme = report.disks.find((d) => d.device === '/dev/nvme0n1');
      expect(nvme?.healthy).toBe(false);
      expect(nvme?.temperature).toBe(55);
    });
  });

  describe('getNetworkDriversReport', () => {
    it('应返回网卡驱动状态报告', async () => {
      const report = await service.getNetworkDriversReport();

      expect(report.drivers.length).toBeGreaterThanOrEqual(3);
      expect(report.loadedCount).toBe(1);
      expect(report.timestamp).toBeTruthy();
    });

    it('应正确标识已加载的驱动', async () => {
      const report = await service.getNetworkDriversReport();

      const r8125 = report.drivers.find((d) => d.driver === 'r8125');
      expect(r8125?.loaded).toBe(true);
      expect(r8125?.vendor).toBe('Realtek');
      expect(r8125?.version).toBe('9.012.00');
    });

    it('应包含接口链路状态', async () => {
      const report = await service.getNetworkDriversReport();

      expect(report.interfaces.length).toBeGreaterThanOrEqual(1);
      const eth0 = report.interfaces.find((i) => i.name === 'eth0');
      expect(eth0?.linkDetected).toBe(true);
      expect(eth0?.speed).toBe('2500Mb/s');
    });
  });

  describe('DAO: fetchAllDiskHealth', () => {
    it('应调用系统层获取磁盘健康数据', async () => {
      const result = await dao.fetchAllDiskHealth();
      expect(result).toHaveLength(2);
    });
  });

  describe('DAO: fetchNetworkDrivers', () => {
    it('应调用系统层获取网卡驱动数据', async () => {
      const result = await dao.fetchNetworkDrivers();
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('DAO: listNetworkInterfaces', () => {
    it('应解析 ip link 输出', async () => {
      const result = await dao.listNetworkInterfaces();
      expect(result).toContain('eth0');
      expect(result).not.toContain('lo');
    });
  });
});
