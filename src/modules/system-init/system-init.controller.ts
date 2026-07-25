/**
 * 模块1：系统初始化 — 控制器层
 * 处理 HTTP 请求/响应，调用 service 层
 */
import type { Request, Response } from 'express';
import * as service from './system-init.service.js';
import type { InitDataRequest } from './system-init.types.js';

/**
 * POST /api/system/init-data
 * 初始化 /data/ 目录结构
 */
export async function handleInitData(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as InitDataRequest;
  const result = await service.initializeDataDirs(body);
  res.status(201).json({ success: true, data: result });
}

/**
 * GET /api/user/:uid/quota
 * 获取用户配额信息
 */
export async function handleGetUserQuota(
  req: Request,
  res: Response,
): Promise<void> {
  const uid = parseInt(String(req.params['uid'] ?? ''), 10);
  const result = await service.getUserQuota(uid);
  res.json({ success: true, data: result });
}

/**
 * POST /api/user/:uid/init
 * 初始化用户数据空间
 */
export async function handleInitUserSpace(
  req: Request,
  res: Response,
): Promise<void> {
  const uid = parseInt(String(req.params['uid'] ?? ''), 10);
  const body = (req.body ?? {}) as { quotaBytes?: string };
  const quotaBytes = body.quotaBytes ? BigInt(body.quotaBytes) : undefined;
  const result = await service.initUserSpace(uid, quotaBytes);
  res.status(201).json({ success: true, data: result });
}
