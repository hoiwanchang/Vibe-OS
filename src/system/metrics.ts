/**
 * 系统指标采集封装
 * 基于 node:os 模块采集 CPU / 内存 / 挂载点指标，无需外部命令白名单扩展
 * 所有函数为纯异步封装，供 metrics 模块调用
 */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

/** CPU 时间片快照（单位：jiffies，通常 10ms） */
export interface CpuTimes {
  user: number;
  nice: number;
  sys: number;
  idle: number;
  irq: number;
}

/** 内存指标 */
export interface MemoryInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  /** 使用率百分比（0-100，保留一位小数） */
  usedPercent: number;
}

/** 挂载点磁盘指标 */
export interface MountInfo {
  device: string;
  mountPoint: string;
  fsType: string;
  totalBytes: number;
  freeBytes: number;
  availableBytes: number;
  usedBytes: number;
  /** 使用率百分比（0-100，保留一位小数） */
  usedPercent: number;
}

/**
 * 汇总所有 CPU 核心的时间片
 * @returns 聚合后的 CPU 时间片快照
 */
export function getCpuTimes(): CpuTimes {
  const cpus = os.cpus();
  const times: CpuTimes = { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
  for (const cpu of cpus) {
    times.user += cpu.times.user;
    times.nice += cpu.times.nice;
    times.sys += cpu.times.sys;
    times.idle += cpu.times.idle;
    times.irq += cpu.times.irq;
  }
  return times;
}

/**
 * 计算两次时间片快照之间的 CPU 使用率
 * @param prev - 前一次快照
 * @param curr - 当前快照
 * @returns 使用率百分比（0-100，保留一位小数）；数据无效时返回 0
 */
export function computeCpuUsagePercent(prev: CpuTimes, curr: CpuTimes): number {
  const totalDelta =
    curr.user +
    curr.nice +
    curr.sys +
    curr.idle +
    curr.irq -
    (prev.user + prev.nice + prev.sys + prev.idle + prev.irq);
  const idleDelta = curr.idle - prev.idle;
  if (totalDelta <= 0) return 0;
  const usage = ((totalDelta - idleDelta) / totalDelta) * 100;
  return Math.round(usage * 10) / 10;
}

/**
 * 采集内存指标
 * @returns 内存总量/已用/使用率
 */
export function getMemoryInfo(): MemoryInfo {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const usedPercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
  return { totalBytes: total, freeBytes: free, usedBytes: used, usedPercent };
}

/**
 * 解析 /proc/mounts 获取挂载点列表
 * 过滤伪文件系统（proc/sysfs/cgroup/tmpfs 等），仅保留真实块设备挂载
 * @returns 挂载点信息数组
 */
export async function getMounts(): Promise<MountInfo[]> {
  let content: string;
  try {
    content = await fs.readFile('/proc/mounts', 'utf-8');
  } catch {
    return [];
  }

  const mounts: MountInfo[] = [];
  const seen = new Set<string>();

  for (const line of content.split('\n')) {
    const parts = line.trim().split(/\s+/);
    const device = parts[0];
    const mountPoint = parts[1];
    const fsType = parts[2];
    if (!device || !mountPoint || !fsType) continue;

    // 仅保留真实块设备（/dev/ 开头），排除 loop 设备噪音可配置
    if (!device.startsWith('/dev/')) continue;
    // 排除只读 squashfs / iso 等安装介质
    if (fsType === 'squashfs' || fsType === 'iso9660') continue;
    if (seen.has(mountPoint)) continue;
    seen.add(mountPoint);

    try {
      const stat = await fs.statfs(mountPoint);
      const totalBytes = stat.blocks * stat.bsize;
      const freeBytes = stat.bfree * stat.bsize;
      const availableBytes = stat.bavail * stat.bsize;
      const usedBytes = totalBytes - freeBytes;
      const denominator = usedBytes + availableBytes;
      const usedPercent =
        denominator > 0
          ? Math.round((usedBytes / denominator) * 1000) / 10
          : 0;
      mounts.push({
        device,
        mountPoint,
        fsType,
        totalBytes,
        freeBytes,
        availableBytes,
        usedBytes,
        usedPercent,
      });
    } catch {
      // 挂载点不可访问时跳过
      continue;
    }
  }

  return mounts;
}

/**
 * 采集系统静态信息（主机名、平台、CPU 型号、运行时长等）
 * @returns 系统信息对象
 */
export function getSystemInfo(): {
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  uptimeSeconds: number;
  loadAvg: [number, number, number];
  nodeVersion: string;
} {
  const cpus = os.cpus();
  const firstCpu = cpus[0];
  const load = os.loadavg();
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpuModel: firstCpu?.model ?? 'unknown',
    cpuCores: cpus.length,
    uptimeSeconds: Math.floor(os.uptime()),
    loadAvg: [
      Math.round((load[0] ?? 0) * 100) / 100,
      Math.round((load[1] ?? 0) * 100) / 100,
      Math.round((load[2] ?? 0) * 100) / 100,
    ],
    nodeVersion: process.version,
  };
}
