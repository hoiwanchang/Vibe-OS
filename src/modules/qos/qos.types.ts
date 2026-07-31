/**
 * 模块：QoS 带宽控制 — 类型定义
 * 基于 Linux tc (traffic control) 实现带宽限制
 */

/** 规则匹配类型 */
export type QosRuleType = 'ip' | 'port' | 'protocol';

/** 流量方向 */
export type QosDirection = 'ingress' | 'egress';

/** QoS 规则 */
export interface QosRule {
  /** 规则 ID */
  id: string;
  /** 网络接口 (如 eth0) */
  interface: string;
  /** 匹配类型 */
  type: QosRuleType;
  /** 匹配目标 (IP / 端口号 / 协议号) */
  target: string;
  /** 流量方向 */
  direction: QosDirection;
  /** 速率限制 (如 '10mbit') */
  rateLimit: string;
  /** 优先级 (1-100) */
  priority: number;
  /** tc class ID (如 '1:10') */
  classId: string;
  /** 创建时间 */
  createdAt: string;
}

/** 创建 QoS 规则请求 */
export interface CreateQosRuleRequest {
  interface: string;
  type: QosRuleType;
  target: string;
  direction: QosDirection;
  rateLimit: string;
  priority?: number;
}

/** 接口流量统计 */
export interface QosInterfaceStats {
  /** 网络接口 */
  interface: string;
  /** 队列规则类型 */
  qdisc: string;
  /** 发送字节数 */
  bytes: number;
  /** 发送包数 */
  packets: number;
  /** 丢包数 */
  dropped: number;
  /** 超限次数 */
  overlimits: number;
}

/** QoS 状态 */
export interface QosStatus {
  /** 各接口统计 */
  interfaces: QosInterfaceStats[];
  /** 原始输出 */
  raw: string;
}

/** 操作结果 */
export interface QosResult {
  ruleId: string;
  message: string;
}
