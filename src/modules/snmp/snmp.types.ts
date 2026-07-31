/**
 * 模块：SNMP 监控 — 类型定义
 */

/** SNMP 服务状态 */
export interface SnmpStatus {
  /** snmpd 服务是否运行中 */
  running: boolean;
}

/** SNMP 配置（持久化到 JSON） */
export interface SnmpConfig {
  /** SNMP community string */
  community: string;
  /** 监听地址（默认 0.0.0.0） */
  listenAddress: string;
  /** 启用的 OID 组 */
  enabledGroups: string[];
}

/** 更新配置请求 */
export interface UpdateSnmpConfigRequest {
  /** SNMP community string（必填） */
  community: string;
  /** 监听地址（可选） */
  listenAddress?: string;
  /** 启用的 OID 组（可选） */
  enabledGroups?: string[];
}

/** CPU OID 数据 */
export interface SnmpCpuData {
  /** 各处理器负载（百分比） */
  loads: number[];
  /** 平均负载 */
  averageLoad: number;
}

/** 内存 OID 数据 */
export interface SnmpMemoryData {
  /** 总内存（KB） */
  totalKb: number;
  /** 已用内存（KB） */
  usedKb: number;
  /** 可用内存（KB） */
  availableKb: number;
}

/** 磁盘 OID 数据 */
export interface SnmpDiskEntry {
  /** 挂载点 / 描述 */
  description: string;
  /** 总空间（KB） */
  totalKb: number;
  /** 已用空间（KB） */
  usedKb: number;
}

/** 网络接口 OID 数据 */
export interface SnmpNetworkEntry {
  /** 接口名称 */
  name: string;
  /** 接收字节数 */
  inOctets: number;
  /** 发送字节数 */
  outOctets: number;
}

/** 温度 OID 数据 */
export interface SnmpTemperatureEntry {
  /** 传感器名称 */
  name: string;
  /** 温度值（摄氏度） */
  value: number;
}

/** 系统 OID 数据汇总 */
export interface SnmpOidData {
  cpu: SnmpCpuData;
  memory: SnmpMemoryData;
  disk: SnmpDiskEntry[];
  network: SnmpNetworkEntry[];
  temperature: SnmpTemperatureEntry[];
}

/** 服务控制操作结果 */
export interface SnmpActionResult {
  /** 消息 */
  message: string;
}
