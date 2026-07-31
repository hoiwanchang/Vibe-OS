/**
 * 模块：USB 外设备份 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './usbbackup.controller.js';

const router: IRouter = Router();

/** GET /api/usbbackup/devices — 检测 USB 设备 */
router.get('/usbbackup/devices', asyncHandler(controller.handleGetDevices));

/** GET /api/usbbackup/config — 获取备份配置 */
router.get('/usbbackup/config', asyncHandler(controller.handleGetConfig));

/** PUT /api/usbbackup/config — 更新备份配置 */
const updateConfigSchema = z.object({
  strategy: z.enum(['copy', 'rsync', 'bidirectional']).optional(),
  sourcePath: z.string().min(1, '源路径不能为空').optional(),
  targetPath: z.string().optional(),
  autoBackup: z.boolean().optional(),
  excludePatterns: z.array(z.string()).optional(),
});
router.put(
  '/usbbackup/config',
  validateBody(updateConfigSchema),
  asyncHandler(controller.handleUpdateConfig),
);

/** POST /api/usbbackup/execute — 执行备份任务 */
const executeSchema = z.object({
  strategy: z.enum(['copy', 'rsync', 'bidirectional']).optional(),
  sourcePath: z.string().min(1).optional(),
  targetPath: z.string().min(1).optional(),
});
router.post(
  '/usbbackup/execute',
  validateBody(executeSchema),
  asyncHandler(controller.handleExecute),
);

/** GET /api/usbbackup/status — 获取当前任务状态 */
router.get('/usbbackup/status', asyncHandler(controller.handleGetStatus));

/** GET /api/usbbackup/history — 获取备份历史 */
router.get('/usbbackup/history', asyncHandler(controller.handleGetHistory));

export { router as usbbackupRoutes };
