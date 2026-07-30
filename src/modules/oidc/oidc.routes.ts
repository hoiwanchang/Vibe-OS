/**
 * oidc 模块 — 路由
 * 公开路由：discovery, jwks, authorize, token, end-session
 * 受保护路由：userinfo, revoke, introspect
 */
import { Router, type Router as RouterType } from 'express';
import {
  authorizeHandler,
  discoveryHandler,
  endSessionHandler,
  introspectHandler,
  jwksHandler,
  revokeHandler,
  tokenHandler,
  tokenRateLimit,
  userinfoHandler,
} from './oidc.controller.js';

/** 公开路由（不经过 authGuard） */
export const oidcPublicRoutes: RouterType = Router();
oidcPublicRoutes.get('/.well-known/openid-configuration', discoveryHandler);
oidcPublicRoutes.get('/oidc/jwks.json', jwksHandler);
oidcPublicRoutes.get('/oidc/authorize', authorizeHandler);
oidcPublicRoutes.post('/oidc/token', tokenRateLimit, tokenHandler);
oidcPublicRoutes.get('/oidc/end-session', endSessionHandler);
oidcPublicRoutes.post('/oidc/end-session', endSessionHandler);

/** 受保护路由（需要 Bearer token，经过 authGuard） */
export const oidcProtectedRoutes: RouterType = Router();
oidcProtectedRoutes.get('/oidc/userinfo', userinfoHandler);
oidcProtectedRoutes.post('/oidc/revoke', revokeHandler);
oidcProtectedRoutes.post('/oidc/introspect', introspectHandler);
