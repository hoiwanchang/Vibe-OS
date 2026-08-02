/**
 * Session 中间件 — 延迟导入 auth.service 避免 bcrypt 阻塞测试
 */
import type { NextFunction, Request, Response } from 'express';
import type { Session } from '../modules/auth/auth.types.js';

const COOKIE_NAME = 'vibeos.sid';

let _svc: typeof import('../modules/auth/auth.service.js') | null = null;
async function svc() {
  if (!_svc) _svc = await import('../modules/auth/auth.service.js');
  return _svc;
}

export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const sid = (req.cookies as Record<string, string> | undefined)?.[COOKIE_NAME];
  if (!sid) { next(); return; }
  try {
    const s: Session | null = await (await svc()).validateSession(sid);
    if (s) { req.session = s; req.user = { uid: s.uid, username: s.username, role: s.role }; }
  } catch { /* ignore */ }
  next();
}
