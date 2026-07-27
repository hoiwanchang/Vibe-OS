/**
 * 系统指标采集 — 单元测试
 * computeCpuUsagePercent 为纯函数直接测试；
 * getMounts 通过 mock node:fs/promises 覆盖解析分支
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import {
  computeCpuUsagePercent,
  getCpuTimes,
  getMemoryInfo,
  getMounts,
  getSystemInfo,
  type CpuTimes,
} from '../metrics.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn(),
    statfs: vi.fn(),
  };
});

describe('computeCpuUsagePercent', () => {
  it('应正确计算使用率（差分算法）', () => {
    const prev: CpuTimes = { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 };
    const curr: CpuTimes = { user: 200, nice: 0, sys: 200, idle: 1600, irq: 0 };
    // totalDelta = 1000, idleDelta = 800 → 20%
    expect(computeCpuUsagePercent(prev, curr)).toBe(20);
  });

  it('总差分为 0 时应返回 0', () => {
    const snap: CpuTimes = { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 };
    expect(computeCpuUsagePercent(snap, snap)).toBe(0);
  });

  it('总差分为负（计数器回绕）时应返回 0', () => {
    const prev: CpuTimes = { user: 500, nice: 0, sys: 500, idle: 4000, irq: 0 };
    const curr: CpuTimes = { user: 100, nice: 0, sys: 100, idle: 800, irq: 0 };
    expect(computeCpuUsagePercent(prev, curr)).toBe(0);
  });

  it('应保留一位小数', () => {
    const prev: CpuTimes = { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
    const curr: CpuTimes = { user: 1, nice: 0, sys: 0, idle: 2, irq: 0 };
    // totalDelta = 3, idleDelta = 2 → 33.3%
    expect(computeCpuUsagePercent(prev, curr)).toBe(33.3);
  });
});

describe('getCpuTimes', () => {
  it('应返回聚合的时间片对象', () => {
    const times = getCpuTimes();
    expect(times.user).toBeGreaterThanOrEqual(0);
    expect(times.idle).toBeGreaterThanOrEqual(0);
    expect(times.sys).toBeGreaterThanOrEqual(0);
  });
});

describe('getMemoryInfo', () => {
  it('应返回合法的内存指标', () => {
    const info = getMemoryInfo();
    expect(info.totalBytes).toBeGreaterThan(0);
    expect(info.usedBytes).toBe(info.totalBytes - info.freeBytes);
    expect(info.usedPercent).toBeGreaterThanOrEqual(0);
    expect(info.usedPercent).toBeLessThanOrEqual(100);
  });
});

describe('getSystemInfo', () => {
  it('应返回主机与 CPU 信息', () => {
    const info = getSystemInfo();
    expect(info.hostname.length).toBeGreaterThan(0);
    expect(info.cpuCores).toBeGreaterThan(0);
    expect(info.loadAvg).toHaveLength(3);
    expect(info.uptimeSeconds).toBeGreaterThan(0);
  });
});

describe('getMounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应解析 /proc/mounts 并过滤伪文件系统', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      [
        'proc /proc proc rw 0 0',
        'sysfs /sys sysfs rw 0 0',
        '/dev/sda1 /data ext4 rw 0 0',
        '/dev/sda1 /data ext4 rw 0 0', // 重复挂载点应去重
        '/dev/loop0 /snap squashfs ro 0 0', // squashfs 应排除
      ].join('\n'),
    );
    vi.mocked(fs.statfs).mockResolvedValue({
      blocks: 1000,
      bsize: 4096,
      bfree: 400,
      bavail: 380,
    } as Awaited<ReturnType<typeof fs.statfs>>);

    const mounts = await getMounts();
    expect(mounts).toHaveLength(1);
    const mount = mounts[0];
    expect(mount?.device).toBe('/dev/sda1');
    expect(mount?.mountPoint).toBe('/data');
    expect(mount?.fsType).toBe('ext4');
    expect(mount?.totalBytes).toBe(1000 * 4096);
    expect(mount?.usedBytes).toBe(600 * 4096);
  });

  it('/proc/mounts 不可读时应返回空数组', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
    const mounts = await getMounts();
    expect(mounts).toEqual([]);
  });

  it('statfs 失败的挂载点应跳过', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('/dev/sda1 /data ext4 rw 0 0\n');
    vi.mocked(fs.statfs).mockRejectedValue(new Error('EACCES'));
    const mounts = await getMounts();
    expect(mounts).toEqual([]);
  });

  it('分母为 0 时使用率应为 0', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('/dev/sda1 /data ext4 rw 0 0\n');
    vi.mocked(fs.statfs).mockResolvedValue({
      blocks: 0,
      bsize: 4096,
      bfree: 0,
      bavail: 0,
    } as Awaited<ReturnType<typeof fs.statfs>>);
    const mounts = await getMounts();
    expect(mounts[0]?.usedPercent).toBe(0);
  });
});
