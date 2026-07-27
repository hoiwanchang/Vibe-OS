/**
 * 模块5：用户与权限管理 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './user.service.js';
import type { CreateUserRequest } from './user.types.js';

/**
 * GET /api/users — 受管用户列表
 */
export async function handleListUsers(
  _req: Request,
  res: Response,
): Promise<void> {
  const data = await service.listManagedUsers();
  res.json({ success: true, data });
}

/**
 * POST /api/users — 创建用户数据空间
 */
export async function handleCreateUser(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as CreateUserRequest;
  const data = await service.createUser(body);
  res.status(201).json({ success: true, data });
}
