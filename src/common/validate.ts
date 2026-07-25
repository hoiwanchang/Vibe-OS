import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema, ZodError, ZodIssue } from 'zod';
import { AppError } from './app-error.js';

/**
 * 请求体校验中间件工厂
 * 使用 Zod schema 校验 req.body，校验失败返回 400
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const zodError: ZodError = result.error;
      const details = zodError.issues
        .map((i: ZodIssue) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      next(AppError.badRequest('VALIDATION_ERROR', `参数校验失败: ${details}`));
      return;
    }
    req.body = result.data as Record<string, unknown>;
    next();
  };
}

/**
 * 路由参数校验中间件工厂
 * 使用 Zod schema 校验 req.params
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const zodError: ZodError = result.error;
      const details = zodError.issues
        .map((i: ZodIssue) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      next(AppError.badRequest('VALIDATION_ERROR', `路径参数校验失败: ${details}`));
      return;
    }
    next();
  };
}
