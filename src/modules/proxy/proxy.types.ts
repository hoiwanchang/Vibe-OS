/**
 * 模块：反向代理管理 — 类型定义
 */

/** 代理协议类型 */
export type ProxyProtocol = 'http' | 'https' | 'ws' | 'wss';

/** 代理规则（域名/路径 → 后端映射） */
export interface ProxyRule {
  /** 规则唯一 ID */
  id: string;
  /** 规则名称（人类可读） */
  name: string;
  /** 监听域名（server_name），支持通配符 *.example.com */
  domain: string;
  /** 匹配路径前缀，默认 '/' */
  path: string;
  /** 后端目标地址 IP:Port */
  target: string;
  /** 是否启用 WebSocket 透传 */
  websocket: boolean;
  /** 是否启用 HTTPS（使用自签证书） */
  https: boolean;
  /** 是否启用访问日志 */
  accessLog: boolean;
  /** 是否启用该规则 */
  enabled: boolean;
  /** 创建时间 ISO 8601 */
  createdAt: string;
  /** 更新时间 ISO 8601 */
  updatedAt: string;
}

/** 创建规则请求体 */
export interface CreateProxyRuleInput {
  name: string;
  domain: string;
  path?: string;
  target: string;
  websocket?: boolean;
  https?: boolean;
  accessLog?: boolean;
  enabled?: boolean;
}

/** 更新规则请求体 */
export interface UpdateProxyRuleInput {
  name?: string;
  domain?: string;
  path?: string;
  target?: string;
  websocket?: boolean;
  https?: boolean;
  accessLog?: boolean;
  enabled?: boolean;
}

/** 证书信息（对接 tls.ts） */
export interface ProxyCertInfo {
  /** 是否已安装 */
  installed: boolean;
  /** 证书路径 */
  certPath: string;
  /** 私钥路径 */
  keyPath: string;
  /** 证书详情（未安装为 null） */
  info: {
    subject: string;
    issuer: string;
    serialNumber: string;
    fingerprint: string;
    validFrom: string;
    validTo: string;
    daysRemaining: number;
    isExpired: boolean;
    isSelfSigned: boolean;
    sans: string[];
  } | null;
  /** 错误信息 */
  error?: string;
}

/** 生成自签证书请求体 */
export interface GenerateCertInput {
  /** 通用名 CN */
  commonName?: string;
  /** SAN 列表 */
  sans: string[];
  /** 有效天数 */
  days?: number;
  /** 密钥位数 */
  keySize?: 2048 | 4096;
}

/** nginx 重载结果 */
export interface ReloadResult {
  /** 是否成功 */
  success: boolean;
  /** 输出信息 */
  message: string;
  /** 生成的配置文件数 */
  configCount: number;
}

/** 代理模块状态 */
export interface ProxyStatus {
  /** 规则总数 */
  totalRules: number;
  /** 启用规则数 */
  enabledRules: number;
  /** HTTPS 证书状态 */
  certInstalled: boolean;
  /** nginx 配置目录 */
  configDir: string;
  /** 最近重载时间 */
  lastReload: string | null;
}
