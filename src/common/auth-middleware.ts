import type { NextFunction, Request, Response } from 'express';
import { API_TOKEN } from '../config.js';
import { AppError } from './app-error.js';

/**
 * API 认证中间件
 * 校验 Authorization: Bearer <token> 头
 * 若未配置 API_TOKEN（开发模式），跳过认证
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  // 开发模式：未配置 token 时跳过认证
  if (!API_TOKEN) {
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    next(AppError.unauthorized());
    return;
  }

  const token = authHeader.slice(7);
  if (token !== API_TOKEN) {
    next(AppError.unauthorized('认证凭据无效'));
    return;
  }

  next();
}
