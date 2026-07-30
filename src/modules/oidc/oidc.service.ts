/**
 * oidc 模块 — 核心业务逻辑
 * 授权/发码/换 token/验签/userinfo/revoke/introspect
 */
import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcrypt';
import {
  ACCESS_TOKEN_TTL_S,
  AUTH_CODE_TTL_MS,
  OIDC_ISSUER,
  REFRESH_TOKEN_TTL_MS,
} from '../../config.js';
import { AppError } from '../../common/app-error.js';
import * as dao from './oidc.dao.js';
import * as keys from './oidc.keys.js';
import type {
  AuthCode,
  IntrospectResponse,
  OAuthClient,
  OpenIdConfiguration,
  RefreshTokenRecord,
  TokenResponse,
  UserInfoResponse,
} from './oidc.types.js';

// ===== 发现文档 =====

/** 获取 OpenID Connect 发现文档 */
export function getDiscovery(): OpenIdConfiguration {
  return {
    issuer: OIDC_ISSUER,
    authorization_endpoint: `${OIDC_ISSUER}/oidc/authorize`,
    token_endpoint: `${OIDC_ISSUER}/oidc/token`,
    userinfo_endpoint: `${OIDC_ISSUER}/oidc/userinfo`,
    jwks_uri: `${OIDC_ISSUER}/oidc/jwks.json`,
    revocation_endpoint: `${OIDC_ISSUER}/oidc/revoke`,
    introspection_endpoint: `${OIDC_ISSUER}/oidc/introspect`,
    end_session_endpoint: `${OIDC_ISSUER}/oidc/end-session`,
    scopes_supported: ['openid', 'profile', 'email', 'groups', 'offline_access'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    code_challenge_methods_supported: ['S256'],
  };
}

// ===== 授权端点 =====

/** 校验授权请求参数 */
export async function validateAuthorizeRequest(params: {
  client_id: string;
  redirect_uri: string;
  scope: string;
  response_type: string;
  code_challenge: string;
  code_challenge_method: string;
}): Promise<OAuthClient> {
  const { client_id, redirect_uri, scope, response_type, code_challenge, code_challenge_method } = params;

  if (response_type !== 'code') {
    throw AppError.badRequest('UNSUPPORTED_RESPONSE_TYPE', '仅支持 response_type=code');
  }
  if (code_challenge_method !== 'S256') {
    throw AppError.badRequest('INVALID_PKCE', '仅支持 code_challenge_method=S256');
  }
  if (!code_challenge) {
    throw AppError.badRequest('MISSING_PKCE', '缺少 code_challenge（PKCE 必须）');
  }
  if (!scope.includes('openid')) {
    throw AppError.badRequest('INVALID_SCOPE', 'scope 必须包含 openid');
  }

  const client = await dao.findClient(client_id);
  if (!client) throw AppError.badRequest('INVALID_CLIENT', '未知的 client_id');
  if (!client.enabled) throw AppError.badRequest('CLIENT_DISABLED', '客户端已禁用');
  if (!client.redirectUris.includes(redirect_uri)) {
    throw AppError.badRequest('INVALID_REDIRECT', 'redirect_uri 不在白名单中');
  }

  return client;
}

/** 生成授权码 */
export async function issueAuthCode(params: {
  clientId: string;
  uid: number;
  username: string;
  scope: string;
  redirectUri: string;
  codeChallenge: string;
  nonce?: string;
}): Promise<string> {
  const code = randomUUID().replace(/-/g, '');
  const now = Date.now();
  const record: AuthCode = {
    code,
    clientId: params.clientId,
    uid: params.uid,
    username: params.username,
    scope: params.scope,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    nonce: params.nonce,
    createdAt: now,
    expiresAt: now + AUTH_CODE_TTL_MS,
    used: false,
  };
  await dao.saveAuthCode(record);
  return code;
}

// ===== Token 端点 =====

/** authorization_code 换 token */
export async function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const { code, clientId, clientSecret, redirectUri, codeVerifier } = params;

  const authCode = await dao.loadAuthCode(code);
  if (!authCode) throw AppError.badRequest('INVALID_GRANT', '授权码无效或已过期');
  if (authCode.used) throw AppError.badRequest('INVALID_GRANT', '授权码已被使用');
  if (authCode.expiresAt < Date.now()) {
    await dao.deleteAuthCode(code);
    throw AppError.badRequest('INVALID_GRANT', '授权码已过期');
  }
  if (authCode.clientId !== clientId) throw AppError.badRequest('INVALID_GRANT', 'client_id 不匹配');
  if (authCode.redirectUri !== redirectUri) throw AppError.badRequest('INVALID_GRANT', 'redirect_uri 不匹配');

  // 校验客户端密钥
  const client = await dao.findClient(clientId);
  if (!client) throw AppError.badRequest('INVALID_CLIENT', '未知客户端');
  if (client.tokenEndpointAuthMethod !== 'none' && clientSecret) {
    const valid = await bcrypt.compare(clientSecret, client.secretHash);
    if (!valid) throw AppError.unauthorized('client_secret 无效');
  }

  // PKCE 校验
  const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
  if (challenge !== authCode.codeChallenge) {
    throw AppError.badRequest('INVALID_GRANT', 'PKCE code_verifier 校验失败');
  }

  // 标记授权码已使用
  await dao.markCodeUsed(code);

  // 签发 token
  return await issueTokens({
    clientId,
    uid: authCode.uid,
    username: authCode.username,
    scope: authCode.scope,
    nonce: authCode.nonce,
    includeRefresh: authCode.scope.includes('offline_access'),
  });
}

/** refresh_token 刷新 */
export async function refreshToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
}): Promise<TokenResponse> {
  const { refreshToken: token, clientId, clientSecret } = params;

  const record = await dao.findRefreshToken(token);
  if (!record) throw AppError.badRequest('INVALID_GRANT', 'refresh_token 无效');
  if (record.revoked) throw AppError.badRequest('INVALID_GRANT', 'refresh_token 已撤销');
  if (record.expiresAt < Date.now()) throw AppError.badRequest('INVALID_GRANT', 'refresh_token 已过期');
  if (record.clientId !== clientId) throw AppError.badRequest('INVALID_GRANT', 'client_id 不匹配');

  // 校验客户端密钥
  const client = await dao.findClient(clientId);
  if (!client) throw AppError.badRequest('INVALID_CLIENT', '未知客户端');
  if (client.tokenEndpointAuthMethod !== 'none' && clientSecret) {
    const valid = await bcrypt.compare(clientSecret, client.secretHash);
    if (!valid) throw AppError.unauthorized('client_secret 无效');
  }

  // Rotation：撤销旧 token
  await dao.revokeRefreshToken(record.jti);

  // 签发新 token（含新 refresh_token）
  return await issueTokens({
    clientId,
    uid: record.uid,
    username: record.username,
    scope: record.scope,
    includeRefresh: true,
  });
}

/** client_credentials（M2M） */
export async function clientCredentials(params: {
  clientId: string;
  clientSecret: string;
  scope: string;
}): Promise<TokenResponse> {
  const { clientId, clientSecret, scope } = params;

  const client = await dao.findClient(clientId);
  if (!client) throw AppError.badRequest('INVALID_CLIENT', '未知客户端');
  if (!client.enabled) throw AppError.badRequest('CLIENT_DISABLED', '客户端已禁用');
  if (!client.grantTypes.includes('client_credentials')) {
    throw AppError.badRequest('UNAUTHORIZED_CLIENT', '客户端未授权 client_credentials');
  }

  const valid = await bcrypt.compare(clientSecret, client.secretHash);
  if (!valid) throw AppError.unauthorized('client_secret 无效');

  return await issueTokens({
    clientId,
    uid: 0,
    username: client.name,
    scope,
    includeRefresh: false,
  });
}

/** 签发 access_token + 可选 id_token + 可选 refresh_token */
async function issueTokens(params: {
  clientId: string;
  uid: number;
  username: string;
  scope: string;
  nonce?: string;
  includeRefresh: boolean;
}): Promise<TokenResponse> {
  const { key, kid } = keys.getSigningKey();
  const now = Math.floor(Date.now() / 1000);
  const jti = randomUUID();

  // Access Token (JWT)
  const accessToken = await new SignJWT({
    scope: params.scope,
    uid: params.uid,
    username: params.username,
    role: 'user',
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(OIDC_ISSUER)
    .setSubject(String(params.uid))
    .setAudience(params.clientId)
    .setExpirationTime(now + ACCESS_TOKEN_TTL_S)
    .setIssuedAt(now)
    .setJti(jti)
    .sign(key);

  const response: TokenResponse = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_S,
    scope: params.scope,
  };

  // ID Token（仅 openid scope）
  if (params.scope.includes('openid')) {
    const idToken = await new SignJWT({
      nonce: params.nonce,
      name: params.username,
      email: `${params.username}@vibeos.local`,
      auth_time: now,
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(OIDC_ISSUER)
      .setSubject(String(params.uid))
      .setAudience(params.clientId)
      .setExpirationTime(now + ACCESS_TOKEN_TTL_S)
      .setIssuedAt(now)
      .sign(key);
    response.id_token = idToken;
  }

  // Refresh Token（不透明字符串，rotation）
  if (params.includeRefresh) {
    const rtJti = randomUUID();
    const rtValue = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const record: RefreshTokenRecord = {
      jti: rtJti,
      token: rtValue,
      clientId: params.clientId,
      uid: params.uid,
      username: params.username,
      scope: params.scope,
      createdAt: Date.now(),
      expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
      revoked: false,
    };
    await dao.saveRefreshToken(record);
    response.refresh_token = rtValue;
  }

  return response;
}

// ===== UserInfo =====

/** 获取用户信息 */
export async function getUserInfo(accessToken: string): Promise<UserInfoResponse> {
  const payload = await verifyAccessToken(accessToken);
  const username = typeof payload['username'] === 'string' ? payload['username'] : '';
  return {
    sub: payload.sub ?? '0',
    name: username,
    email: `${username}@vibeos.local`,
    uid: Number(payload['uid'] ?? 0),
    username,
    groups: payload['groups'] as string[] | undefined,
  };
}

// ===== Revoke (RFC 7009) =====

/** 撤销令牌 */
export async function revokeToken(token: string): Promise<void> {
  // 尝试作为 refresh token 撤销
  const record = await dao.findRefreshToken(token);
  if (record) {
    await dao.revokeRefreshToken(record.jti);
    return;
  }
  // access token 是 JWT，无法真正撤销（无状态），静默成功（RFC 7009）
}

// ===== Introspect (RFC 7662) =====

/** 令牌内省 */
export async function introspectToken(token: string): Promise<IntrospectResponse> {
  // 先尝试作为 refresh token
  const record = await dao.findRefreshToken(token);
  if (record) {
    if (record.revoked || record.expiresAt < Date.now()) {
      return { active: false };
    }
    return {
      active: true,
      scope: record.scope,
      client_id: record.clientId,
      username: record.username,
      token_type: 'refresh_token',
      exp: Math.floor(record.expiresAt / 1000),
      iat: Math.floor(record.createdAt / 1000),
      sub: String(record.uid),
      iss: OIDC_ISSUER,
    };
  }

  // 尝试作为 access token (JWT)
  try {
    const payload = await verifyAccessToken(token);
    const scope = typeof payload['scope'] === 'string' ? payload['scope'] : '';
    const username = typeof payload['username'] === 'string' ? payload['username'] : '';
    return {
      active: true,
      scope,
      client_id: String(payload.aud ?? ''),
      username,
      token_type: 'Bearer',
      exp: payload.exp,
      iat: payload.iat,
      sub: payload.sub,
      iss: payload.iss,
    };
  } catch {
    return { active: false };
  }
}

// ===== 内部工具 =====

/** 验证 access token JWT */
async function verifyAccessToken(token: string): Promise<Record<string, unknown> & { sub?: string; aud?: string; exp?: number; iat?: number; iss?: string }> {
  const allKeys = await keys.getAllPublicKeys();
  for (const key of allKeys) {
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: OIDC_ISSUER,
        algorithms: ['RS256'],
      });
      return payload as Record<string, unknown> & { sub?: string; aud?: string; exp?: number; iat?: number; iss?: string };
    } catch {
      // 尝试下一个密钥
    }
  }
  throw AppError.unauthorized('access_token 无效或已过期');
}
