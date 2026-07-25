import type { NextFunction, Request, Response } from 'express';
import { AppError } from './app-error.js';

/**
 * 统一错误处理中间件
 * 捕获所有 AppError 和未知异常，返回标准化 JSON 错误响应
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // 未知异常：不泄露内部细节
  console.error('[NAISys] 未捕获异常:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    },
  });
}
