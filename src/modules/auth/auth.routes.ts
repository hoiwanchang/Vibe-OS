/**
 * auth 模块 — 路由
 * 公开路由（不经过 authGuard）：login, 2fa/login
 * 受保护路由：logout, me, change-password, 2fa/*
 */
import { Router, type Router as RouterType } from 'express';
import {
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
} from './auth.controller.js';
import {
  backupCodesHandler,
  disableHandler,
  forceHandler,
  loginHandler as twoFactorLoginHandler,
  regenerateHandler,
  setupHandler,
  statusHandler,
  verifyHandler,
} from './two-factor.controller.js';

export const authRoutes: RouterType = Router();

authRoutes.post('/auth/login', loginHandler);
authRoutes.post('/auth/logout', logoutHandler);
authRoutes.get('/auth/me', meHandler);
authRoutes.post('/auth/change-password', changePasswordHandler);

// ===== 2FA 路由 =====
authRoutes.post('/auth/2fa/setup', setupHandler);
authRoutes.post('/auth/2fa/verify', ...verifyHandler);
authRoutes.post('/auth/2fa/disable', ...disableHandler);
authRoutes.get('/auth/2fa/backup-codes', backupCodesHandler);
authRoutes.post('/auth/2fa/regenerate', ...regenerateHandler);
authRoutes.post('/auth/2fa/login', ...twoFactorLoginHandler);
authRoutes.get('/auth/2fa/status', statusHandler);
authRoutes.post('/auth/2fa/force', ...forceHandler);