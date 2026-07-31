/**
 * 模块：DNS 服务器 — 类型定义
 * 基于 dnsmasq 实现本地 DNS 服务
 */

/** DNS 记录类型 */
export type DnsRecordType = 'A' | 'CNAME' | 'PTR';

/** DNS 记录 */
export interface DnsRecord {
  /** 记录 ID */
  id: string;
  /** 记录类型 */
  type: DnsRecordType;
  /** 主机名 */
  name: string;
  /** 记录值 (IP / 别名 / PTR 目标) */
  value: string;
  /** TTL (秒) */
  ttl: number;
  /** 创建时间 */
  createdAt: string;
}

/** 创建 DNS 记录请求 */
export interface CreateDnsRecordRequest {
  type: DnsRecordType;
  name: string;
  value: string;
  ttl?: number;
}

/** DNS 上游配置 */
export interface DnsConfig {
  /** 上游 DNS 服务器列表 */
  upstreamServers: string[];
  /** 监听地址 */
  listenAddress: string;
  /** 缓存大小 */
  cacheSize: number;
}

/** 更新 DNS 配置请求 */
export interface UpdateDnsConfigRequest {
  upstreamServers: string[];
  listenAddress?: string;
  cacheSize?: number;
}

/** DNS 服务状态 */
export interface DnsStatus {
  /** 是否运行中 */
  running: boolean;
  /** 进程 PID */
  pid: number | null;
  /** 版本信息 */
  version: string | null;
}

/** 操作结果 */
export interface DnsResult {
  recordId: string;
  message: string;
}
