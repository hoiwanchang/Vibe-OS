/**
 * 模块：回收站策略 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { validateBody } from '../../common/validate.js';
import * as controller from './recyclebin.controller.js';

const router: IRouter = Router();

/** GET /api/recyclebin/config — 获取回收站配置 */
router.get(
  '/recyclebin/config',
  asyncHandler(controller.handleGetConfig),
);

/** PUT /api/recyclebin/config — 更新回收站配置 */
const shareConfigSchema = z.object({
  shareName: z.string().min(1, '共享文件夹名称不能为空'),
  enabled: z.boolean(),
  retentionDays: z
    .number()
    .int('保留天数必须为整数')
    .min(0, '保留天数最小为 0（不限）'),
  maxSizeBytes: z
    .number()
    .int('大小上限必须为整数')
    .min(0, '大小上限最小为 0（不限）'),
  excludeExtensions: z.array(z.string()),
  excludePaths: z.array(z.string()),
});

const updateConfigSchema = z.object({
  shares: z.array(shareConfigSchema),
});

router.put(
  '/recyclebin/config',
  validateBody(updateConfigSchema),
  asyncHandler(controller.handleUpdateConfig),
);

/** GET /api/recyclebin/files — 列出回收站文件 */
router.get(
  '/recyclebin/files',
  asyncHandler(controller.handleListFiles),
);

/** POST /api/recyclebin/restore/:id — 恢复文件 */
router.post(
  '/recyclebin/restore/:id',
  asyncHandler(controller.handleRestoreFile),
);

/** DELETE /api/recyclebin/empty — 清空回收站 */
router.delete(
  '/recyclebin/empty',
  asyncHandler(controller.handleEmpty),
);

/** GET /api/recyclebin/stats — 回收站统计 */
router.get(
  '/recyclebin/stats',
  asyncHandler(controller.handleGetStats),
);

export { router as recyclebinRoutes };
