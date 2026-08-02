/**
 * Express Request 类型扩展
 * 挂载 session 和 user 到 req
 */
import type { Session } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** 当前会话（session cookie 认证时存在） */
      session?: Session;
      /** 当前认证用户（session 或 bearer token） */
      user?: {
        uid: number;
        username: string;
        role: 'admin' | 'user';
      };
    }
  }
}

export {};
