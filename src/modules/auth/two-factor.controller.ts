/**
 * 2FA / TOTP 请求处理层
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import { AppError } from '../../common/app-error.js';
import { SESSION_COOKIE_NAME, IS_PRODUCTION } from '../../config.js';
import * as twoFactor from './two-factor.service.js';

// ===== Zod Schemas =====

const verifySchema = z.object({
  code: z.string().length(6, '验证码必须为 6 位'),
});

const disableSchema = z.object({
  password: z.string().min(1, '密码不能为空'),
});

const loginSchema = z.object({
  token: z.string().min(1, 'token 不能为空'),
  code: z.string().min(1, '验证码不能为空'),
});

const regenerateSchema = z.object({
  code: z.string().length(6, '验证码必须为 6 位'),
});

const force2faSchema = z.object({
  force2fa: z.boolean(),
});

// ===== 辅助 =====

/** 从 req.user 获取 uid，未登录则 401 */
function requireUser(req: Request): { uid: number; username: string } {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('未登录');
  }
  return { uid: user.uid, username: user.username };
}

/** 设置 session cookie */
function setSessionCookie(res: Response, sid: string, maxAge: number): void {
  res.cookie(SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PRODUCTION,
    maxAge,
    path: '/',
  });
}

// ===== Handlers =====

/** POST /api/auth/2fa/setup — 生成 TOTP secret + URI + 二维码 */
export const setupHandler = asyncHandler(async (req: Request, res: Response) => {
  const { uid, username } = requireUser(req);
  const result = await twoFactor.setup(uid, username);
  res.json({ success: true, data: result });
});

/** POST /api/auth/2fa/verify — 验证 TOTP 码，启用 2FA */
export const verifyHandler = [
  validateBody(verifySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { uid } = requireUser(req);
    const { code } = req.body as { code: string };
    const result = await twoFactor.verify(uid, code);
    res.json({ success: true, data: result });
  }),
];

/** POST /api/auth/2fa/disable — 关闭 2FA（需密码确认） */
export const disableHandler = [
  validateBody(disableSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { uid } = requireUser(req);
    const { password } = req.body as { password: string };
    await twoFactor.disable(uid, password);
    res.json({ success: true, data: { message: '2FA 已关闭' } });
  }),
];

/** GET /api/auth/2fa/backup-codes — 查看备用码 */
export const backupCodesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { uid } = requireUser(req);
  const result = await twoFactor.getBackupCodes(uid);
  res.json({ success: true, data: result });
});

/** POST /api/auth/2fa/regenerate — 重新生成备用码 */
export const regenerateHandler = [
  validateBody(regenerateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { uid } = requireUser(req);
    const { code } = req.body as { code: string };
    const result = await twoFactor.regenerateBackupCodes(uid, code);
    res.json({ success: true, data: result });
  }),
];

/** POST /api/auth/2fa/login — 提交 TOTP 码完成登录 */
export const loginHandler = [
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { token, code } = req.body as { token: string; code: string };
    const { user, session } = await twoFactor.verify2FALogin(token, code);
    setSessionCookie(res, session.sid, session.expiresAt - session.createdAt);
    res.json({ success: true, data: user });
  }),
];

/** GET /api/auth/2fa/status — 查询 2FA 状态 */
export const statusHandler = asyncHandler(async (req: Request, res: Response) => {
  const { uid } = requireUser(req);
  const config = await twoFactor.loadConfig(uid);
  const global = await twoFactor.getGlobalConfig();
  res.json({
    success: true,
    data: {
      enabled: config?.enabled ?? false,
      force2fa: global.force2fa,
    },
  });
});

/** POST /api/auth/2fa/force — 管理员设置强制全员 2FA */
export const forceHandler = [
  validateBody(force2faSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) throw AppError.unauthorized('未登录');
    if (user.role !== 'admin') throw AppError.forbidden('仅管理员可设置强制 2FA');
    const { force2fa } = req.body as { force2fa: boolean };
    await twoFactor.setForce2FA(force2fa);
    res.json({ success: true, data: { force2fa } });
  }),
];