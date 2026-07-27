/**
 * 模块4：系统指标监控 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './metrics.service.js';

/**
 * GET /api/metrics/cpu — CPU 使用率
 */
export async function handleCpuUsage(
  _req: Request,
  res: Response,
): Promise<void> {
  const data = await service.getCpuUsage();
  res.json({ success: true, data });
}

/**
 * GET /api/metrics/memory — 内存使用
 */
export function handleMemoryUsage(_req: Request, res: Response): void {
  const data = service.getMemoryUsage();
  res.json({ success: true, data });
}

/**
 * GET /api/metrics/storage — 存储池使用率
 */
export async function handleStoragePools(
  _req: Request,
  res: Response,
): Promise<void> {
  const data = await service.getStoragePools();
  res.json({ success: true, data });
}

/**
 * GET /api/metrics/overview — 系统概览（仪表盘聚合）
 */
export async function handleOverview(
  _req: Request,
  res: Response,
): Promise<void> {
  const data = await service.getSystemOverview();
  res.json({ success: true, data });
}
