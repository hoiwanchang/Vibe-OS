/**
 * 认证中间件（重构版）
 * 认证链：
 * 1. VIBEOS_AUTH_DISABLED=true → 跳过（开发模式）
 * 2. VIBEOS_API_TOKEN 匹配 → 通过（deprecated 后门）
 * 3. Session cookie 有效 → 通过（sessionMiddleware 已挂载 req.user）
 * 4. Bearer token 有效（OIDC access_token JWT 验签）→ 通过
 * 5. 以上都不满足 → 401
 */
import type { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';
import { API_TOKEN, AUTH_DISABLED, OIDC_ISSUER } from '../config.js';
import { AppError } from './app-error.js';
import { getAllPublicKeys } from '../modules/oidc/oidc.keys.js';

/**
 * 认证守卫中间件
 * 要求请求已通过 sessionMiddleware 或携带有效 Bearer token
 */
export async function authGuard(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  // 1. 开发模式跳过
  if (AUTH_DISABLED) {
    if (!req.user) {
      req.user = { uid: 1000, username: 'admin', role: 'admin' };
    }
    next();
    return;
  }

  // 2. API Token 后门（deprecated）
  if (API_TOKEN) {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === API_TOKEN) {
      if (!req.user) {
        req.user = { uid: 0, username: 'api-token', role: 'admin' };
      }
      next();
      return;
    }
  }

  // 3. Session cookie（sessionMiddleware 已处理）
  if (req.user) {
    next();
    return;
  }

  // 4. Bearer JWT（OIDC access_token）
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const keys = await getAllPublicKeys();
      for (const key of keys) {
        try {
          const { payload } = await jwtVerify(token, key, {
            issuer: OIDC_ISSUER,
            algorithms: ['RS256'],
          });
          const username = typeof payload['username'] === 'string' ? payload['username'] : String(payload.sub ?? '');
          req.user = {
            uid: Number(payload['uid'] ?? payload.sub ?? 0),
            username,
            role: (payload['role'] as 'admin' | 'user') ?? 'user',
          };
          next();
          return;
        } catch {
          // 尝试下一个密钥
        }
      }
    } catch {
      // 无可用密钥
    }
  }

  // 5. 全部失败
  next(AppError.unauthorized());
}

/**
 * 旧版兼容导出（逐步废弃）
 * @deprecated 使用 authGuard 替代
 */
export const authMiddleware = authGuard;
