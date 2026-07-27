/**
 * 模块4：系统指标监控 — 单元测试
 * Mock 系统层 metrics 模块，验证 service 组装逻辑与 controller 响应格式
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../system/metrics.js', () => ({
  getCpuTimes: vi
    .fn()
    .mockReturnValue({ user: 100, nice: 0, sys: 100, idle: 800, irq: 0 }),
  computeCpuUsagePercent: vi.fn().mockReturnValue(20),
  getMemoryInfo: vi.fn().mockReturnValue({
    totalBytes: 8000000000,
    freeBytes: 3000000000,
    usedBytes: 5000000000,
    usedPercent: 62.5,
  }),
  getMounts: vi.fn().mockResolvedValue([
    {
      device: '/dev/sda1',
      mountPoint: '/data',
      fsType: 'ext4',
      totalBytes: 1000000000000,
      freeBytes: 400000000000,
      availableBytes: 380000000000,
      usedBytes: 600000000000,
      usedPercent: 61.2,
    },
  ]),
  getSystemInfo: vi.fn().mockReturnValue({
    hostname: 'naisys-test',
    platform: 'Linux 6.1.0',
    arch: 'x64',
    cpuModel: 'Test CPU',
    cpuCores: 8,
    uptimeSeconds: 3600,
    loadAvg: [0.5, 0.4, 0.3],
    nodeVersion: 'v22.0.0',
  }),
}));

import * as service from '../metrics.service.js';
import * as controller from '../metrics.controller.js';

describe('metrics.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCpuUsage 应返回使用率与负载', async () => {
    const result = await service.getCpuUsage();
    expect(result.usagePercent).toBe(20);
    expect(result.cores).toBe(8);
    expect(result.loadAvg).toEqual([0.5, 0.4, 0.3]);
    expect(result.timestamp).toBeTruthy();
  });

  it('getMemoryUsage 应返回内存指标', () => {
    const result = service.getMemoryUsage();
    expect(result.totalBytes).toBe(8000000000);
    expect(result.usedPercent).toBe(62.5);
  });

  it('getStoragePools 应返回挂载点列表', async () => {
    const result = await service.getStoragePools();
    expect(result.count).toBe(1);
    expect(result.pools[0]?.mountPoint).toBe('/data');
  });

  it('getSystemOverview 应聚合全部指标', async () => {
    const result = await service.getSystemOverview();
    expect(result.system.hostname).toBe('naisys-test');
    expect(result.cpu.usagePercent).toBe(20);
    expect(result.memory.usedPercent).toBe(62.5);
    expect(result.storage).toHaveLength(1);
  });
});

describe('metrics.controller', () => {
  /** 构造 mock Response 对象 */
  function mockRes() {
    return {
      json: vi.fn().mockReturnThis(),
    } as unknown as import('express').Response;
  }

  it('handleCpuUsage 应返回 success 包装', async () => {
    const res = mockRes();
    await controller.handleCpuUsage(
      {} as import('express').Request,
      res,
    );
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      success: true,
    });
  });

  it('handleMemoryUsage 应返回 success 包装', () => {
    const res = mockRes();
    controller.handleMemoryUsage({} as import('express').Request, res);
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      success: true,
    });
  });

  it('handleStoragePools 应返回 success 包装', async () => {
    const res = mockRes();
    await controller.handleStoragePools(
      {} as import('express').Request,
      res,
    );
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      success: true,
    });
  });

  it('handleOverview 应返回 success 包装', async () => {
    const res = mockRes();
    await controller.handleOverview({} as import('express').Request, res);
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      success: true,
    });
  });
});
