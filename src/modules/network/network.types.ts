/**
 * 模块：网络配置 — 类型定义
 */
export interface NetInterface {
  name: string;
  type: 'ethernet' | 'wifi' | 'bridge' | 'vlan' | 'loopback';
  state: 'up' | 'down';
  method: 'dhcp' | 'static' | 'manual';
  addresses: Array<{ family: 'inet' | 'inet6'; address: string; prefix: number }>;
  mac: string;
  speed: string | null;
  gateway: string | null;
}

export interface FirewallRule {
  id: string;
  chain: 'input' | 'forward' | 'output';
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  port: number | string | null;
  action: 'accept' | 'drop' | 'reject';
  source: string | null;
  comment: string;
}

export interface ListeningPort {
  protocol: string;
  localAddress: string;
  port: number;
  process: string | null;
  pid: number | null;
}

export interface DnsConfig {
  servers: string[];
  search: string[];
}
