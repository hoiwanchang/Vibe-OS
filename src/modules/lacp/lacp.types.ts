/**
 * 模块：链路聚合（LACP/Bonding） — 类型定义
 */

/** Bonding 模式 */
export type BondMode = 'balance-rr' | 'active-backup' | '802.3ad';

/** Bonding 成员网卡信息 */
export interface BondMemberInfo {
  /** 网卡名称 */
  name: string;
  /** 链路状态 */
  state: 'up' | 'down';
  /** 速率（如 "1000 Mbps"） */
  speed: string | null;
  /** 双工模式 */
  duplex: string | null;
  /** 链路故障计数 */
  linkFailureCount: number;
  /** MAC 地址 */
  mac: string;
}

/** Bonding 接口信息 */
export interface BondInfo {
  /** Bonding 接口名称 */
  name: string;
  /** Bonding 模式 */
  mode: string;
  /** 接口状态 */
  state: 'up' | 'down';
  /** 成员网卡列表 */
  members: BondMemberInfo[];
  /** 聚合器 ID（802.3ad 模式） */
  aggregatorId: number | null;
  /** 总带宽（Mbps，仅统计活跃成员） */
  totalBandwidthMbps: number;
}

/** 创建 Bonding 请求 */
export interface CreateBondRequest {
  /** Bonding 接口名称 */
  name: string;
  /** Bonding 模式 */
  mode: BondMode;
  /** 成员网卡列表 */
  members: string[];
}

/** Bonding 状态详情 */
export interface BondStatus extends BondInfo {
  /** 活跃成员数 */
  activeMembers: number;
  /** 总成员数 */
  totalMembers: number;
}
