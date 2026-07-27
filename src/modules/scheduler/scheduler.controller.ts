/**
 * 模块：计划任务 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './scheduler.service.js';

export async function handleListJobs(_req: Request, res: Response): Promise<void> {
  const jobs = await service.listJobs();
  res.json({ success: true, data: { jobs } });
}

export async function handleCreateJob(req: Request, res: Response): Promise<void> {
  const body = req.body as { name: string; command: string; schedule: string; enabled?: boolean };
  const job = await service.createJob(body);
  res.status(201).json({ success: true, data: { job } });
}

export async function handleUpdateJob(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const job = await service.updateJob(id, req.body as Record<string, unknown>);
  res.json({ success: true, data: { job } });
}

export async function handleDeleteJob(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const removed = await service.deleteJob(id);
  res.json({ success: true, data: { removed } });
}

export async function handleRunJob(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const execution = await service.runJob(id);
  res.json({ success: true, data: { execution } });
}

export async function handleHistory(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const limit = parseInt(String(req.query['limit'] as string ?? '20'), 10);
  const executions = await service.getHistory(id, limit);
  res.json({ success: true, data: { executions } });
}
