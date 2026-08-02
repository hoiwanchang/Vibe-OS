/**
 * 模块：UPS 电源管理（NUT） — 类型定义
 */

/** UPS 实时状态 */
export interface UpsStatus {
  /** UPS 设备名称 */
  name: string;
  /** 电池电量（百分比 0-100） */
  batteryCharge: number | null;
  /** 负载（百分比 0-100） */
  load: number | null;
  /** 输入电压（V） */
  inputVoltage: number | null;
  /** 剩余运行时间（秒） */
  runtime: number | null;
  /** 是否在线（市电供电） */
  online: boolean;
  /** UPS 原始状态字符串（如 "OL"、"OB DISCHRG"） */
  rawStatus: string | null;
}

/** UPS 配置 */
export interface UpsConfig {
  /** 关机阈值（电池电量百分比，低于此值触发关机） */
  shutdownThreshold: number;
  /** 通知邮箱（可选） */
  notifyEmail: string | null;
}

/** 更新 UPS 配置请求 */
export interface UpdateUpsConfigRequest {
  /** 关机阈值（电池电量百分比） */
  shutdownThreshold: number;
  /** 通知邮箱（可选） */
  notifyEmail?: string;
}

/** UPS 事件记录 */
export interface UpsEvent {
  /** 事件时间（ISO 8601） */
  timestamp: string;
  /** 事件类型 */
  type: 'info' | 'warning' | 'critical' | 'test';
  /** 事件描述 */
  message: string;
}

/** 模拟关机测试结果 */
export interface TestShutdownResult {
  /** 是否成功记录 */
  recorded: boolean;
  /** 事件记录 */
  event: UpsEvent;
}
