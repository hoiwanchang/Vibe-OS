/**
 * 模块4：系统指标监控 — 路由定义
 */
import { Router, type Router as IRouter } from 'express';
import { asyncHandler } from '../../common/async-handler.js';
import * as controller from './metrics.controller.js';

const router: IRouter = Router();

/** GET /api/metrics/cpu — CPU 使用率 */
router.get('/metrics/cpu', asyncHandler(controller.handleCpuUsage));

/** GET /api/metrics/memory — 内存使用 */
router.get('/metrics/memory', controller.handleMemoryUsage);

/** GET /api/metrics/storage — 存储池使用率 */
router.get('/metrics/storage', asyncHandler(controller.handleStoragePools));

/** GET /api/metrics/overview — 系统概览（仪表盘聚合） */
router.get('/metrics/overview', asyncHandler(controller.handleOverview));

export default router;
