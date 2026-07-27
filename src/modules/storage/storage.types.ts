/**
 * 模块：存储池管理 — 类型定义
 */

export interface PhysicalDisk {
  device: string;
  model: string;
  serial: string;
  sizeBytes: number;
  fsType: string | null;
  mountPoint: string | null;
  inPool: string | null;
  smart: { healthy: boolean; temperature: number | null; powerOnHours: number | null };
}

export interface StoragePoolInfo {
  name: string;
  level: string;
  devices: string[];
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
  mountPoint: string;
  state: 'active' | 'degraded' | 'rebuilding' | 'inactive';
  syncProgress?: number;
}

export interface DiskSmartDetail {
  device: string;
  healthy: boolean;
  temperature: number | null;
  powerOnHours: number | null;
  attributes: Record<string, { value: number; worst: number; thresh: number; raw: number }>;
}

export interface ScrubStatus {
  running: boolean;
  progress?: number;
  errors?: number;
}
