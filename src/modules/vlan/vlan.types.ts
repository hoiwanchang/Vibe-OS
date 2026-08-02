/**
 * 模块：VLAN 管理 — 类型定义
 */

/** VLAN 接口信息 */
export interface VlanInfo {
  /** 接口名称（如 eth0.100） */
  id: string;
  /** VLAN ID（1-4094） */
  vlanId: number;
  /** 父接口名称 */
  parentInterface: string;
  /** 接口状态 */
  state: 'up' | 'down';
  /** MAC 地址 */
  mac: string;
  /** VLAN 协议（如 802.1Q） */
  protocol: string;
  /** IP 地址列表 */
  addresses: Array<{ family: 'inet' | 'inet6'; address: string; prefix: number }>;
}

/** 创建 VLAN 请求 */
export interface CreateVlanRequest {
  /** 父接口名称 */
  parentInterface: string;
  /** VLAN ID（1-4094） */
  vlanId: number;
  /** IP 地址（CIDR 格式，如 192.168.100.1/24） */
  ipAddress?: string;
}

/** 更新 VLAN 请求 */
export interface UpdateVlanRequest {
  /** 新 IP 地址（CIDR 格式） */
  ipAddress: string;
}
