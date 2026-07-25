/**
 * 模块2：硬件健康与驱动状态监控 — 控制器层
 * 处理 HTTP 请求/响应，调用 service 层
 */
import type { Request, Response } from 'express';
import * as service from './hardware.service.js';

/**
 * GET /api/hardware/disk-health
 * 获取所有磁盘的 SMART 健康状态
 */
export async function handleGetDiskHealth(
  _req: Request,
  res: Response,
): Promise<void> {
  const report = await service.getDiskHealthReport();
  res.json({ success: true, data: report });
}

/**
 * GET /api/hardware/network-drivers
 * 获取网卡驱动加载状态与接口链路信息
 */
export async function handleGetNetworkDrivers(
  _req: Request,
  res: Response,
): Promise<void> {
  const report = await service.getNetworkDriversReport();
  res.json({ success: true, data: report });
}
