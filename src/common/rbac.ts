/**
 * RBAC 中间件
 * 角色：admin | user
 * 用法：router.get('/admin-only', requireRole('admin'), handler)
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './app-error.js';
import type { UserRole } from '../modules/auth/auth.types.js';

/**
 * 要求指定角色的中间件工厂
 * @param role - 所需角色
 */
export function requireRole(role: UserRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (req.user.role !== role) {
      next(AppError.forbidden(`需要 ${role} 权限`));
      return;
    }
    next();
  };
}
