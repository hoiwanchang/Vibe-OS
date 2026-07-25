/**
 * 模块2：硬件健康与驱动状态监控 — 类型定义
 */

/** 磁盘 SMART 健康信息 */
export interface DiskHealthInfo {
  /** 设备路径，如 /dev/sda */
  device: string;
  /** SMART 健康状态是否通过 */
  healthy: boolean;
  /** 温度（摄氏度） */
  temperature: number | null;
  /** 通电时长（小时） */
  powerOnHours: number | null;
  /** SMART 属性表 */
  attributes: Record<
    string,
    { value: number; worst: number; thresh: number; raw: number }
  >;
  /** smartctl 原始输出 */
  rawOutput: string;
}

/** 块设备信息 */
export interface BlockDeviceInfo {
  /** 设备名，如 sda */
  name: string;
  /** 容量（字节） */
  sizeBytes: bigint;
  /** 设备类型 */
  type: string;
  /** 挂载点 */
  mountPoint: string | null;
  /** 型号 */
  model: string | null;
  /** 序列号 */
  serial: string | null;
  /** 传输协议（sata, nvme, usb 等） */
  transport: string | null;
}

/** 网卡驱动信息 */
export interface NetworkDriverInfo {
  /** 驱动名 */
  driver: string;
  /** 芯片厂商 */
  vendor: string;
  /** 产品描述 */
  product: string;
  /** 驱动是否已加载 */
  loaded: boolean;
  /** 驱动版本 */
  version: string | null;
  /** 固件版本 */
  firmware: string | null;
  /** 匹配的 PCI 设备描述 */
  pciDevices: string[];
}

/** 网络接口信息 */
export interface NetworkInterfaceInfo {
  /** 接口名 */
  name: string;
  /** 链路是否连通 */
  linkDetected: boolean;
  /** 速率 */
  speed: string | null;
  /** 双工模式 */
  duplex: string | null;
  /** 使用的驱动 */
  driver: string | null;
}

/** 磁盘健康 API 响应 */
export interface DiskHealthResponse {
  /** 检测时间戳 */
  timestamp: string;
  /** 磁盘总数 */
  totalDisks: number;
  /** 健康磁盘数 */
  healthyDisks: number;
  /** 各磁盘详情 */
  disks: Array<{
    device: string;
    healthy: boolean;
    temperature: number | null;
    powerOnHours: number | null;
    model: string | null;
    serial: string | null;
    transport: string | null;
    sizeBytes: string;
  }>;
}

/** 网卡驱动 API 响应 */
export interface NetworkDriversResponse {
  /** 检测时间戳 */
  timestamp: string;
  /** 驱动列表 */
  drivers: NetworkDriverInfo[];
  /** 已加载的驱动数 */
  loadedCount: number;
  /** 网络接口状态 */
  interfaces: NetworkInterfaceInfo[];
}
