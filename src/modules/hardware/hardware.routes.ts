/**
 * 模块2：硬件健康与驱动状态监控 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { asyncHandler } from '../../common/async-handler.js';
import * as controller from './hardware.controller.js';

const router: IRouter = Router();

/** GET /api/hardware/disk-health — 磁盘健康状态 */
router.get(
  '/hardware/disk-health',
  asyncHandler(controller.handleGetDiskHealth),
);

/** GET /api/hardware/network-drivers — 网卡驱动状态 */
router.get(
  '/hardware/network-drivers',
  asyncHandler(controller.handleGetNetworkDrivers),
);

export default router;
