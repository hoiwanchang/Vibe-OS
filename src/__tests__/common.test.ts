/**
 * 公共模块测试 — AppError、error-handler、auth-middleware、validate
 */
import { describe, it, expect, vi } from 'vitest';
import { AppError } from '../common/app-error.js';
import { errorHandler } from '../common/error-handler.js';
import { authMiddleware } from '../common/auth-middleware.js';
import type { Request, Response, NextFunction } from 'express';

describe('AppError', () => {
  it('应创建正确状态码的错误', () => {
    const err = AppError.badRequest('TEST', '测试错误');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('TEST');
    expect(err.message).toBe('测试错误');
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('unauthorized 应返回 401', () => {
    const err = AppError.unauthorized();
    expect(err.statusCode).toBe(401);
  });

  it('forbidden 应返回 403', () => {
    const err = AppError.forbidden('禁止');
    expect(err.statusCode).toBe(403);
  });

  it('notFound 应返回 404', () => {
    const err = AppError.notFound('用户');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('用户');
  });

  it('conflict 应返回 409', () => {
    const err = AppError.conflict('已存在');
    expect(err.statusCode).toBe(409);
  });

  it('internal 应返回 500 且非 operational', () => {
    const err = AppError.internal('崩溃');
    expect(err.statusCode).toBe(500);
    expect(err.isOperational).toBe(false);
  });

  it('commandFailed 应返回 502', () => {
    const err = AppError.commandFailed('smartctl', '超时');
    expect(err.statusCode).toBe(502);
    expect(err.message).toContain('smartctl');
  });
});

describe('errorHandler', () => {
  const mockRes = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const mockReq = {} as Request;
  const mockNext = vi.fn() as NextFunction;

  it('应正确处理 AppError', () => {
    const err = AppError.badRequest('TEST', '测试');
    errorHandler(err, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'TEST', message: '测试' },
    });
  });

  it('应正确处理未知异常', () => {
    const err = new Error('未知');
    errorHandler(err, mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(500);
  });
});

describe('authMiddleware', () => {
  const mockNext = vi.fn() as NextFunction;
  const mockRes = {} as Response;

  it('未配置 API_TOKEN 时应跳过认证', () => {
    const req = { headers: {} } as Request;
    authMiddleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });
});
