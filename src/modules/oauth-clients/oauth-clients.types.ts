/**
 * oauth-clients 模块 — 类型定义
 */

/** 创建客户端请求 */
export interface CreateClientRequest {
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  scopes?: string[];
  grantTypes?: Array<'authorization_code' | 'refresh_token' | 'client_credentials'>;
  tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
  logoUrl?: string;
}

/** 更新客户端请求 */
export interface UpdateClientRequest {
  name?: string;
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  scopes?: string[];
  grantTypes?: Array<'authorization_code' | 'refresh_token' | 'client_credentials'>;
  tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'none';
  logoUrl?: string;
  enabled?: boolean;
}

/** 客户端响应（不含 secret） */
export interface ClientResponse {
  id: string;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  scopes: string[];
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
}

/** 创建客户端响应（含明文 secret，仅一次） */
export interface CreateClientResponse extends ClientResponse {
  secret: string;
}

/** 重置 secret 响应 */
export interface ResetSecretResponse {
  id: string;
  secret: string;
}
