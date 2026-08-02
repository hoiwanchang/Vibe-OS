/**
 * 模块：动态 DNS — 类型定义
 */

/** DNS 服务提供商 */
export type DdnsProvider = 'cloudflare' | 'aliyun' | 'custom';

/** 单条 DDNS 记录配置 */
export interface DdnsRecord {
  /** 记录唯一 ID */
  id: string;
  /** 是否启用 */
  enabled: boolean;
  /** DNS 提供商 */
  provider: DdnsProvider;
  /** 域名（如 example.com） */
  domain: string;
  /** 子域名（如 nas，完整记录为 nas.example.com；@ 表示根域名） */
  subdomain: string;
  /** 记录类型 */
  recordType: 'A' | 'AAAA';
  /** 提供商 API 凭据 */
  credentials: DdnsCredentials;
  /** 自定义 HTTP 接口配置（仅 provider=custom 时使用） */
  custom?: CustomHttpConfig;
  /** 上次成功更新的 IP */
  lastIp: string | null;
  /** 上次更新时间（ISO 8601） */
  lastUpdated: string | null;
  /** 上次更新状态 */
  lastStatus: 'success' | 'failed' | 'skipped' | null;
}

/** Cloudflare 凭据 */
export interface CloudflareCredentials {
  apiToken: string;
  zoneId: string;
}

/** 阿里云 DNS 凭据 */
export interface AliyunCredentials {
  accessKeyId: string;
  accessKeySecret: string;
}

/** 自定义 HTTP 接口配置 */
export interface CustomHttpConfig {
  /** 更新 URL，支持占位符 {ip} 和 {domain} */
  url: string;
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT';
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** POST/PUT 请求体模板，支持 {ip} 和 {domain} 占位符 */
  bodyTemplate?: string;
}

/** 联合凭据类型 */
export type DdnsCredentials = CloudflareCredentials | AliyunCredentials;

/** DDNS 全局配置 */
export interface DdnsConfig {
  /** 是否全局启用 DDNS 服务 */
  enabled: boolean;
  /** 自动更新间隔（分钟），0 表示禁用自动更新 */
  intervalMinutes: number;
  /** 用于检测公网 IP 的服务列表 */
  ipCheckUrls: string[];
  /** DDNS 记录列表 */
  records: DdnsRecord[];
}

/** 更新历史记录 */
export interface DdnsHistoryEntry {
  /** 记录 ID */
  id: string;
  /** 关联的 DDNS 记录 ID */
  recordId: string;
  /** 域名（冗余存储，方便查询） */
  domain: string;
  /** 提供商 */
  provider: DdnsProvider;
  /** 更新目标 IP */
  ip: string;
  /** 更新结果 */
  status: 'success' | 'failed' | 'skipped';
  /** 失败时的错误信息 */
  error: string | null;
  /** 时间戳（ISO 8601） */
  timestamp: string;
}

/** DDNS 状态响应 */
export interface DdnsStatus {
  /** 全局是否启用 */
  enabled: boolean;
  /** 网络是否在线 */
  online: boolean;
  /** 当前检测到的公网 IP */
  publicIp: string | null;
  /** 记录数量 */
  recordCount: number;
  /** 各记录摘要状态 */
  records: Array<{
    id: string;
    domain: string;
    subdomain: string;
    provider: DdnsProvider;
    enabled: boolean;
    lastIp: string | null;
    lastStatus: 'success' | 'failed' | 'skipped' | null;
    lastUpdated: string | null;
  }>;
}

/** 更新执行结果 */
export interface DdnsUpdateResult {
  recordId: string;
  domain: string;
  status: 'success' | 'failed' | 'skipped';
  ip: string | null;
  message: string;
}
