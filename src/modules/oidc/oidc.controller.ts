/**
 * oidc 模块 — 请求处理层
 */
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../../common/async-handler.js';
import { AppError } from '../../common/app-error.js';
import * as service from './oidc.service.js';
import * as keys from './oidc.keys.js';

/** /oidc/token 速率限制：每 IP 每分钟 30 次 */
export const tokenRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁' } },
});

/** GET /.well-known/openid-configuration */
export const discoveryHandler = asyncHandler((_req: Request, res: Response) => {
  res.json(service.getDiscovery());
});

/** GET /oidc/jwks.json */
export const jwksHandler = asyncHandler((_req: Request, res: Response) => {
  res.json(keys.getJwks());
});

/** GET /oidc/authorize */
export const authorizeHandler = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query;
  const client_id = typeof q['client_id'] === 'string' ? q['client_id'] : '';
  const redirect_uri = typeof q['redirect_uri'] === 'string' ? q['redirect_uri'] : '';
  const scope = typeof q['scope'] === 'string' ? q['scope'] : 'openid';
  const response_type = typeof q['response_type'] === 'string' ? q['response_type'] : 'code';
  const code_challenge = typeof q['code_challenge'] === 'string' ? q['code_challenge'] : '';
  const code_challenge_method = typeof q['code_challenge_method'] === 'string' ? q['code_challenge_method'] : 'S256';
  const state = typeof q['state'] === 'string' ? q['state'] : '';
  const nonce = typeof q['nonce'] === 'string' ? q['nonce'] : undefined;
  const consent = typeof q['consent'] === 'string' ? q['consent'] : '';

  if (!client_id || !redirect_uri) {
    throw AppError.badRequest('INVALID_REQUEST', '缺少 client_id 或 redirect_uri');
  }

  // 校验参数
  const client = await service.validateAuthorizeRequest({
    client_id,
    redirect_uri,
    scope,
    response_type,
    code_challenge,
    code_challenge_method,
  });

  // 未登录 → 重定向到登录页
  if (!req.user) {
    const loginUrl = `/login?redirect=${encodeURIComponent(req.originalUrl)}`;
    res.redirect(loginUrl);
    return;
  }

  // 需要用户同意（简化：首次授权自动同意，后续可扩展同意页）
  if (consent !== 'approved') {
    // 重定向到前端同意页
    const params = new URLSearchParams({
      client_id,
      client_name: client.name,
      scope,
      redirect_uri,
      state,
      nonce: nonce ?? '',
      code_challenge,
      original: req.originalUrl,
    });
    res.redirect(`/consent?${params.toString()}`);
    return;
  }

  // 用户已同意 → 发码
  const code = await service.issueAuthCode({
    clientId: client_id,
    uid: req.user.uid,
    username: req.user.username,
    scope,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    nonce,
  });

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);
  res.redirect(redirectUrl.toString());
});

/** POST /oidc/token */
export const tokenHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, string | undefined>;
  const grant_type = body['grant_type'];

  // 解析 client 认证（Basic 或 POST body）
  let clientId = body['client_id'];
  let clientSecret = body['client_secret'];

  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const colonIdx = decoded.indexOf(':');
    clientId = decoded.slice(0, colonIdx);
    clientSecret = decoded.slice(colonIdx + 1);
  }

  if (!clientId) throw AppError.badRequest('INVALID_REQUEST', '缺少 client_id');

  let result;
  switch (grant_type) {
    case 'authorization_code': {
      const code = body['code'];
      const redirect_uri = body['redirect_uri'];
      const code_verifier = body['code_verifier'];
      if (!code || !redirect_uri || !code_verifier) {
        throw AppError.badRequest('INVALID_REQUEST', '缺少 code/redirect_uri/code_verifier');
      }
      result = await service.exchangeCode({ code, clientId, clientSecret, redirectUri: redirect_uri, codeVerifier: code_verifier });
      break;
    }
    case 'refresh_token': {
      const refresh_token = body['refresh_token'];
      if (!refresh_token) throw AppError.badRequest('INVALID_REQUEST', '缺少 refresh_token');
      result = await service.refreshToken({ refreshToken: refresh_token, clientId, clientSecret });
      break;
    }
    case 'client_credentials': {
      const scope = body['scope'] ?? '';
      if (!clientSecret) throw AppError.badRequest('INVALID_REQUEST', 'client_credentials 需要 client_secret');
      result = await service.clientCredentials({ clientId, clientSecret, scope });
      break;
    }
    default:
      throw AppError.badRequest('UNSUPPORTED_GRANT_TYPE', `不支持的 grant_type: ${grant_type ?? ''}`);
  }

  res.json(result);
});

/** GET /oidc/userinfo */
export const userinfoHandler = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    throw AppError.unauthorized('缺少 Bearer token');
  }
  const token = authHeader.slice(7);
  const userInfo = await service.getUserInfo(token);
  res.json(userInfo);
});

/** POST /oidc/revoke */
export const revokeHandler = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as Record<string, string>;
  if (!token) throw AppError.badRequest('INVALID_REQUEST', '缺少 token');
  await service.revokeToken(token);
  res.status(200).json({});
});

/** POST /oidc/introspect */
export const introspectHandler = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as Record<string, string>;
  if (!token) throw AppError.badRequest('INVALID_REQUEST', '缺少 token');
  const result = await service.introspectToken(token);
  res.json(result);
});

/** GET/POST /oidc/end-session */
export const endSessionHandler = asyncHandler((req: Request, res: Response) => {
  const queryUri = typeof req.query['post_logout_redirect_uri'] === 'string' ? req.query['post_logout_redirect_uri'] : undefined;
  const bodyUri = typeof (req.body as Record<string, unknown> | undefined)?.['post_logout_redirect_uri'] === 'string'
    ? (req.body as Record<string, string>)['post_logout_redirect_uri']
    : undefined;
  const postLogoutUri = queryUri ?? bodyUri;

  // 清除 session cookie
  res.clearCookie('vibeos.sid', { path: '/' });

  if (postLogoutUri) {
    res.redirect(postLogoutUri);
  } else {
    res.json({ success: true, data: { message: '已登出' } });
  }
});
