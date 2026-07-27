/**
 * 模块4：系统指标监控 — 类型定义
 */

/** CPU 使用率响应 */
export interface CpuUsageResponse {
  /** 采样时间戳 */
  timestamp: string;
  /** CPU 使用率百分比（0-100） */
  usagePercent: number;
  /** 逻辑核心数 */
  cores: number;
  /** 1/5/15 分钟负载均值 */
  loadAvg: [number, number, number];
}

/** 内存使用响应 */
export interface MemoryUsageResponse {
  timestamp: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  /** 使用率百分比（0-100） */
  usedPercent: number;
}

/** 存储池（挂载点）条目 */
export interface StoragePoolEntry {
  device: string;
  mountPoint: string;
  fsType: string;
  totalBytes: number;
  freeBytes: number;
  availableBytes: number;
  usedBytes: number;
  /** 使用率百分比（0-100） */
  usedPercent: number;
}

/** 存储池响应 */
export interface StoragePoolResponse {
  timestamp: string;
  /** 挂载点数量 */
  count: number;
  pools: StoragePoolEntry[];
}

/** 系统概览响应（仪表盘聚合接口） */
export interface SystemOverviewResponse {
  timestamp: string;
  system: {
    hostname: string;
    platform: string;
    arch: string;
    cpuModel: string;
    cpuCores: number;
    uptimeSeconds: number;
    loadAvg: [number, number, number];
    nodeVersion: string;
  };
  cpu: { usagePercent: number; cores: number };
  memory: MemoryUsageResponse;
  storage: StoragePoolEntry[];
}
