/**
 * 模块4：系统指标监控 — 业务逻辑层
 * CPU 使用率采用双采样差分算法（间隔 300ms），避免瞬时值失真
 */
import {
  computeCpuUsagePercent,
  getCpuTimes,
  getMemoryInfo,
  getMounts,
  getSystemInfo,
  type CpuTimes,
} from '../../system/metrics.js';
import type {
  CpuUsageResponse,
  MemoryUsageResponse,
  StoragePoolResponse,
  SystemOverviewResponse,
} from './metrics.types.js';

/** CPU 双采样间隔（毫秒） */
const CPU_SAMPLE_INTERVAL_MS = 300;

/** 上一次 CPU 时间片快照（模块级缓存，用于快速查询） */
let lastCpuSnapshot: CpuTimes | null = null;

/**
 * 延迟指定毫秒
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 获取 CPU 使用率（双采样差分）
 * @returns CPU 使用率响应
 */
export async function getCpuUsage(): Promise<CpuUsageResponse> {
  const prev = lastCpuSnapshot ?? getCpuTimes();
  await sleep(CPU_SAMPLE_INTERVAL_MS);
  const curr = getCpuTimes();
  lastCpuSnapshot = curr;

  const info = getSystemInfo();
  return {
    timestamp: new Date().toISOString(),
    usagePercent: computeCpuUsagePercent(prev, curr),
    cores: info.cpuCores,
    loadAvg: info.loadAvg,
  };
}

/**
 * 获取内存使用指标
 * @returns 内存使用响应
 */
export function getMemoryUsage(): MemoryUsageResponse {
  return {
    timestamp: new Date().toISOString(),
    ...getMemoryInfo(),
  };
}

/**
 * 获取存储池（所有真实块设备挂载点）指标
 * @returns 存储池响应
 */
export async function getStoragePools(): Promise<StoragePoolResponse> {
  const pools = await getMounts();
  return {
    timestamp: new Date().toISOString(),
    count: pools.length,
    pools,
  };
}

/**
 * 获取系统概览（仪表盘聚合接口，一次请求返回全部指标）
 * @returns 系统概览响应
 */
export async function getSystemOverview(): Promise<SystemOverviewResponse> {
  const [cpu, storage] = await Promise.all([getCpuUsage(), getStoragePools()]);
  const memory = getMemoryUsage();
  const info = getSystemInfo();

  return {
    timestamp: new Date().toISOString(),
    system: info,
    cpu: { usagePercent: cpu.usagePercent, cores: cpu.cores },
    memory,
    storage: storage.pools,
  };
}
