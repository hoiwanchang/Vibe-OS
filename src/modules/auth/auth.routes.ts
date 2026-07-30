/**
 * auth 模块 — 路由
 * 公开路由（不经过 authGuard）：login
 * 受保护路由：logout, me, change-password
 */
import { Router, type Router as RouterType } from 'express';
import {
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
} from './auth.controller.js';

export const authRoutes: RouterType = Router();

authRoutes.post('/auth/login', loginHandler);
authRoutes.post('/auth/logout', logoutHandler);
authRoutes.get('/auth/me', meHandler);
authRoutes.post('/auth/change-password', changePasswordHandler);
