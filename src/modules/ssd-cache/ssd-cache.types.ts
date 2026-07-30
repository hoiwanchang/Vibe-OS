/**
 * 模块：SSD 缓存管理 — 类型定义
 * 基于 LVM cache (lvmcache/dm-cache) 实现 SSD 缓存加速
 */

/** SSD 缓存模式 */
export type SsdCacheMode = 'read' | 'write' | 'readwrite';

/** 创建 SSD 缓存请求 */
export interface CreateSsdCacheRequest {
  /** SSD 设备路径（如 /dev/sdb） */
  ssdDevice: string;
  /** 需要加速的池设备/LV 路径（如 /dev/vg0/lv_data） */
  poolDevice: string;
  /** 缓存模式 */
  mode: SsdCacheMode;
}

/** SSD 缓存状态条目 */
export interface SsdCacheStatus {
  /** 缓存名称（LV 名称） */
  name: string;
  /** 缓存模式 */
  mode: SsdCacheMode;
  /** 缓存池设备 */
  cachePool: string;
  /** 被加速的原始 LV */
  originLv: string;
  /** 缓存命中率（百分比 0-100） */
  hitRate: number;
  /** SSD 温度（摄氏度） */
  temperature: number;
  /** SSD 剩余寿命（百分比 0-100） */
  lifePercent: number;
  /** 缓存大小（字节） */
  sizeBytes: number;
  /** 已使用缓存块数 */
  usedBlocks: number;
  /** 总缓存块数 */
  totalBlocks: number;
}

/** SSD 缓存创建结果 */
export interface SsdCacheCreateResult {
  /** 缓存名称 */
  name: string;
  /** 缓存模式 */
  mode: SsdCacheMode;
  /** 消息 */
  message: string;
}
