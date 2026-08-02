/**
 * 模块：视频转码 — 请求处理
 */
import type { Request, Response } from 'express';
import * as service from './transcode.service.js';
import type { CreateTranscodeRequest } from './transcode.types.js';

/** GET /api/transcode/tasks — 转码任务列表 */
export function handleListTasks(
  _req: Request,
  res: Response,
): void {
  const tasks = service.listTasks();
  res.json({ success: true, data: tasks });
}

/** POST /api/transcode/tasks — 创建转码任务 */
export async function handleCreateTask(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as CreateTranscodeRequest;
  const result = await service.createTask(body);
  res.status(201).json({ success: true, data: result });
}

/** GET /api/transcode/tasks/:id — 任务详情 */
export function handleGetTask(
  req: Request,
  res: Response,
): void {
  const id = req.params['id'] as string;
  const task = service.getTask(id);
  res.json({ success: true, data: task });
}

/** DELETE /api/transcode/tasks/:id — 取消/删除任务 */
export function handleDeleteTask(
  req: Request,
  res: Response,
): void {
  const id = req.params['id'] as string;
  const result = service.deleteTask(id);
  res.json({ success: true, data: result });
}

/** GET /api/transcode/hwaccel — 检测硬件加速 */
export async function handleDetectHwAccel(
  _req: Request,
  res: Response,
): Promise<void> {
  const info = await service.detectHwAccel();
  res.json({ success: true, data: info });
}
