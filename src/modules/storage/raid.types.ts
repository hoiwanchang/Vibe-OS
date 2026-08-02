/**
 * 模块：RAID 阵列管理 — 类型定义
 */

/** 支持的 RAID 级别 */
export type RaidLevel = 'raid0' | 'raid1' | 'raid5' | 'raid6' | 'raid10';

/** 阵列运行状态 */
export type RaidState = 'online' | 'degraded' | 'rebuilding' | 'inactive';

/** RAID 阵列概要信息（列表用） */
export interface RaidArraySummary {
  name: string;
  device: string;
  level: RaidLevel | 'unknown';
  state: RaidState;
  deviceCount: number;
}

/** RAID 阵列详情 */
export interface RaidArrayDetail {
  name: string;
  device: string;
  level: RaidLevel | 'unknown';
  state: RaidState;
  devices: string[];
  spares: string[];
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  syncProgress: number | null;
}

/** 创建阵列请求体 */
export interface CreateRaidRequest {
  name: string;
  level: RaidLevel;
  devices: string[];
  spares?: string[];
}
