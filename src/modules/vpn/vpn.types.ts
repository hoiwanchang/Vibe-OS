/**
 * 模块：WireGuard VPN — 类型定义
 */

/** WireGuard 服务状态 */
export interface VpnStatus {
  /** 服务是否运行中 */
  running: boolean;
  /** 接口名称 */
  interface: string;
  /** 服务端公钥 */
  publicKey: string | null;
  /** 监听端口 */
  listenPort: number | null;
  /** 已连接 peer 数量 */
  peerCount: number;
}

/** 初始化服务器请求 */
export interface InitServerRequest {
  /** 监听端口 */
  port: number;
  /** VPN 子网（CIDR，如 10.8.0.0/24） */
  subnet: string;
  /** DNS 服务器（可选） */
  dns?: string;
}

/** 服务器配置（持久化） */
export interface ServerConfig {
  /** 服务端私钥 */
  privateKey: string;
  /** 服务端公钥 */
  publicKey: string;
  /** 监听端口 */
  port: number;
  /** VPN 子网 */
  subnet: string;
  /** 服务端 VPN IP（子网第一个可用地址） */
  address: string;
  /** DNS 服务器 */
  dns: string | null;
  /** 创建时间 */
  createdAt: string;
}

/** Peer 元数据（持久化） */
export interface PeerRecord {
  /** Peer 名称 */
  name: string;
  /** Peer 公钥 */
  publicKey: string;
  /** Peer 私钥（用于导出配置） */
  privateKey: string;
  /** 预共享密钥（可选） */
  presharedKey: string | null;
  /** 分配的 VPN IP */
  address: string;
  /** 允许的 IP（AllowedIPs） */
  allowedIps: string;
  /** 创建时间 */
  createdAt: string;
}

/** Peer 运行时信息（wg show 解析） */
export interface PeerInfo {
  /** Peer 公钥 */
  publicKey: string;
  /** Peer 名称（从元数据匹配） */
  name: string | null;
  /** 分配的 VPN IP */
  address: string | null;
  /** 最近握手时间 */
  lastHandshake: string | null;
  /** 接收字节数 */
  rxBytes: number;
  /** 发送字节数 */
  txBytes: number;
  /** 端点地址 */
  endpoint: string | null;
  /** 允许的 IP 列表 */
  allowedIps: string[];
}

/** 添加 Peer 请求 */
export interface AddPeerRequest {
  /** Peer 名称 */
  name: string;
  /** 允许的 IP（可选，默认 0.0.0.0/0） */
  allowedIps?: string;
}

/** 添加 Peer 响应 */
export interface AddPeerResult {
  /** Peer 公钥 */
  publicKey: string;
  /** Peer 名称 */
  name: string;
  /** 分配的 VPN IP */
  address: string;
  /** 消息 */
  message: string;
}

/** 更新服务器请求 */
export interface UpdateServerRequest {
  /** 监听端口（可选） */
  port?: number;
  /** DNS 服务器（可选） */
  dns?: string;
}

/** 操作结果 */
export interface VpnResult {
  /** 消息 */
  message: string;
}
