/**
 * 模块：FTP/SFTP 服务管理 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './ftp.controller.js';

const router: IRouter = Router();

/** GET /api/ftp/status — FTP/SFTP 服务状态 */
router.get('/ftp/status', asyncHandler(controller.handleGetStatus));

/** PUT /api/ftp/config — 更新配置 */
const updateConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).optional(),
  passivePortMin: z.number().int().min(1024).max(65535).optional(),
  passivePortMax: z.number().int().min(1024).max(65535).optional(),
  anonymousAccess: z.boolean().optional(),
  tlsEnabled: z.boolean().optional(),
  tlsCertPath: z.string().optional(),
  tlsKeyPath: z.string().optional(),
  sftpEnabled: z.boolean().optional(),
  sftpChrootDirectory: z.string().optional(),
});
router.put('/ftp/config', validateBody(updateConfigSchema), asyncHandler(controller.handleUpdateConfig));

/** POST /api/ftp/start — 启动 FTP */
router.post('/ftp/start', asyncHandler(controller.handleStart));

/** POST /api/ftp/stop — 停止 FTP */
router.post('/ftp/stop', asyncHandler(controller.handleStop));

/** POST /api/ftp/restart — 重启 FTP */
router.post('/ftp/restart', asyncHandler(controller.handleRestart));

/** GET /api/ftp/logs — 连接日志 */
router.get('/ftp/logs', asyncHandler(controller.handleGetLogs));

/** GET /api/ftp/users/:uid — 获取用户权限 */
router.get('/ftp/users/:uid', asyncHandler(controller.handleGetUserPermission));

/** PUT /api/ftp/users/:uid — 更新用户权限 */
const updateUserSchema = z.object({
  allowed: z.boolean().optional(),
  rootDir: z.string().optional(),
  bandwidthLimitKbps: z.number().int().min(0).optional(),
});
router.put('/ftp/users/:uid', validateBody(updateUserSchema), asyncHandler(controller.handleUpdateUserPermission));

export default router;
