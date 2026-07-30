/**
 * 公共模块扩展测试 — auth-middleware 认证路径 + validateParams
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// 设置 API_TOKEN 环境变量以测试认证逻辑
vi.mock('../config.js', () => ({
  API_TOKEN: 'test-secret-token',
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  SECRETS_DIR: '/data/vibeos/secrets',
  SYSTEM_CACHE_DIR: '/data/vibeos/cache',
  DEFAULT_QUOTA_BYTES: 107374182400n,
  PORT: 3000,
  HOST: '127.0.0.1',
  COMMAND_TIMEOUT_MS: 30000,
  USER_SUBDIRS: ['files', 'config', 'cache'],
  APP_SUBDIRS: ['models', 'data', 'logs'],
}));

import { authMiddleware } from '../common/auth-middleware.js';
import { validateParams } from '../common/validate.js';
import { z } from 'zod';

describe('authMiddleware（带 Token）', () => {
  const mockNext = vi.fn() as NextFunction;
  const mockRes = {} as Response;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('有效 Bearer token 应通过认证', () => {
    const req = { headers: { authorization: 'Bearer test-secret-token' } } as unknown as Request;
    authMiddleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('无效 token 应返回 401', () => {
    const req = { headers: { authorization: 'Bearer wrong-token' } } as unknown as Request;
    authMiddleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('缺少 Authorization 头应返回 401', () => {
    const req = { headers: {} } as unknown as Request;
    authMiddleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('非 Bearer 格式应返回 401', () => {
    const req = { headers: { authorization: 'Basic abc123' } } as unknown as Request;
    authMiddleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

describe('validateParams', () => {
  const mockNext = vi.fn() as NextFunction;
  const mockRes = {} as Response;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('有效参数应通过', () => {
    const schema = z.object({ uid: z.string().regex(/^\d+$/) });
    const middleware = validateParams(schema);
    const req = { params: { uid: '1000' } } as unknown as Request;
    middleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it('无效参数应返回 400', () => {
    const schema = z.object({ uid: z.string().regex(/^\d+$/) });
    const middleware = validateParams(schema);
    const req = { params: { uid: 'abc' } } as unknown as Request;
    middleware(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
