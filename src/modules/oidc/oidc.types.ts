/**
 * oidc 模块 — 类型定义
 */

/** OAuth 客户端元数据 */
export interface OAuthClient {
  id: string;
  secretHash: string;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  scopes: string[];
  grantTypes: Array<'authorization_code' | 'refresh_token' | 'client_credentials'>;
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
}

/** 授权码记录 */
export interface AuthCode {
  code: string;
  clientId: string;
  uid: number;
  username: string;
  scope: string;
  redirectUri: string;
  codeChallenge: string;
  nonce?: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

/** 刷新令牌记录 */
export interface RefreshTokenRecord {
  jti: string;
  token: string;
  clientId: string;
  uid: number;
  username: string;
  scope: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
}

/** Token 端点响应 */
export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
}

/** UserInfo 响应 */
export interface UserInfoResponse {
  sub: string;
  name: string;
  email?: string;
  uid: number;
  username: string;
  groups?: string[];
}

/** Introspect 响应 */
export interface IntrospectResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  iss?: string;
}

/** OIDC 发现文档 */
export interface OpenIdConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  revocation_endpoint: string;
  introspection_endpoint: string;
  end_session_endpoint: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
}
