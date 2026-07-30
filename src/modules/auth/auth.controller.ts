/**
 * auth 模块 — 请求处理层
 */
import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/async-handler.js';
import { SESSION_COOKIE_NAME, IS_PRODUCTION } from '../../config.js';
import * as service from './auth.service.js';

/** POST /api/auth/login */
export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body as { username: string; password: string };
  const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
  const result = await service.login(username, password, ip);

  if (result.require2fa) {
    res.json({ success: true, data: { require2fa: true, token: result.token } });
    return;
  }

  res.cookie(SESSION_COOKIE_NAME, result.session.sid, {
    httpOnly: true,
    sameSite: 'strict',
    secure: IS_PRODUCTION,
    maxAge: result.session.expiresAt - result.session.createdAt,
    path: '/',
  });

  res.json({ success: true, data: { require2fa: false, ...result.user } });
});

/** POST /api/auth/logout */
export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const sid = (req.cookies as Record<string, string>)[SESSION_COOKIE_NAME];
  if (sid) {
    await service.logout(sid);
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ success: true, data: { message: '已登出' } });
});

/** GET /api/auth/me */
export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '未登录' } });
    return;
  }
  const current = await service.getCurrentUser(user.uid);
  res.json({ success: true, data: current });
});

/** POST /api/auth/change-password */
export const changePasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '未登录' } });
    return;
  }
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  await service.changePassword(user.uid, { currentPassword, newPassword });
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ success: true, data: { message: '密码已修改，请重新登录' } });
});
