/**
 * 认证中间件 + RBAC + session 中间件测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ===== auth-middleware 测试 =====
const mockGetAllPublicKeys = vi.fn().mockResolvedValue([]);
vi.mock('../modules/oidc/oidc.keys.js', () => ({
  getAllPublicKeys: () => mockGetAllPublicKeys(),
}));

vi.mock('../config.js', () => ({
  API_TOKEN: 'test-api-token',
  AUTH_DISABLED: false,
  OIDC_ISSUER: 'http://127.0.0.1:3000',
}));

import { authGuard } from '../common/auth-middleware.js';
import { requireRole } from '../common/rbac.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

describe('authGuard', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('API Token 匹配应通过', async () => {
    const req = mockReq({ headers: { authorization: 'Bearer test-api-token' } });
    const next = vi.fn();
    await authGuard(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user?.username).toBe('api-token');
  });

  it('已有 session 用户应通过', async () => {
    const req = mockReq({ user: { uid: 1000, username: 'admin', role: 'admin' } });
    const next = vi.fn();
    await authGuard(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('无任何认证应 401', async () => {
    const req = mockReq({ headers: {} });
    const next = vi.fn();
    await authGuard(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('无效 Bearer token 应 401', async () => {
    mockGetAllPublicKeys.mockResolvedValue([]);
    const req = mockReq({ headers: { authorization: 'Bearer invalid-jwt' } });
    const next = vi.fn();
    await authGuard(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

describe('authGuard AUTH_DISABLED', () => {
  it('开发模式应跳过认证', async () => {
    // 需要重新导入带 AUTH_DISABLED=true 的模块
    vi.resetModules();
    vi.doMock('../config.js', () => ({
      API_TOKEN: '', AUTH_DISABLED: true, OIDC_ISSUER: 'http://127.0.0.1:3000',
    }));
    vi.doMock('../modules/oidc/oidc.keys.js', () => ({
      getAllPublicKeys: vi.fn().mockResolvedValue([]),
    }));
    const { authGuard: disabledGuard } = await import('../common/auth-middleware.js');
    const req = mockReq({ headers: {} });
    const next = vi.fn();
    await disabledGuard(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user?.username).toBe('admin');
    vi.doUnmock('../config.js');
    vi.doUnmock('../modules/oidc/oidc.keys.js');
  });
});

describe('requireRole', () => {
  it('admin 用户访问 admin 路由应通过', () => {
    const middleware = requireRole('admin');
    const req = mockReq({ user: { uid: 1000, username: 'admin', role: 'admin' } });
    const next = vi.fn();
    middleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('user 角色访问 admin 路由应 403', () => {
    const middleware = requireRole('admin');
    const req = mockReq({ user: { uid: 1001, username: 'bob', role: 'user' } });
    const next = vi.fn();
    middleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('未认证应 401', () => {
    const middleware = requireRole('admin');
    const req = mockReq({ user: undefined });
    const next = vi.fn();
    middleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

describe('sessionMiddleware', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('无 cookie 应直接 next', async () => {
    vi.resetModules();
    vi.doMock('../modules/auth/auth.service.js', () => ({
      validateSession: vi.fn(),
    }));
    const { sessionMiddleware } = await import('../common/session-middleware.js');
    const req = mockReq({ cookies: {} });
    const next = vi.fn();
    await sessionMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
    vi.doUnmock('../modules/auth/auth.service.js');
  });

  it('有效 session 应挂载 req.user', async () => {
    vi.resetModules();
    const mockValidate = vi.fn().mockResolvedValue({
      sid: 's1', uid: 1000, username: 'admin', role: 'admin',
      createdAt: Date.now(), expiresAt: Date.now() + 99999,
    });
    vi.doMock('../modules/auth/auth.service.js', () => ({
      validateSession: mockValidate,
    }));
    const { sessionMiddleware } = await import('../common/session-middleware.js');
    const req = mockReq({ cookies: { 'vibeos.sid': 's1' } });
    const next = vi.fn();
    await sessionMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user?.uid).toBe(1000);
    expect(req.user?.role).toBe('admin');
    vi.doUnmock('../modules/auth/auth.service.js');
  });

  it('无效 session 应不挂载 user', async () => {
    vi.resetModules();
    vi.doMock('../modules/auth/auth.service.js', () => ({
      validateSession: vi.fn().mockResolvedValue(null),
    }));
    const { sessionMiddleware } = await import('../common/session-middleware.js');
    const req = mockReq({ cookies: { 'vibeos.sid': 'expired' } });
    const next = vi.fn();
    await sessionMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
    vi.doUnmock('../modules/auth/auth.service.js');
  });
});
