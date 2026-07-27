/**
 * 模块：备份与快照 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './backup.service.js';

export async function handleListJobs(_req: Request, res: Response): Promise<void> {
  const jobs = await service.listJobs();
  res.json({ success: true, data: { jobs } });
}

export async function handleCreateJob(req: Request, res: Response): Promise<void> {
  const body = req.body as { name: string; source: string; target: string; schedule?: string; type: 'rsync' | 'snapshot' | 'archive' };
  const job = await service.createJob(body);
  res.status(201).json({ success: true, data: { job } });
}

export async function handleRunJob(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const execution = await service.runJob(id);
  res.json({ success: true, data: { execution } });
}

export async function handleDeleteJob(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const removed = await service.deleteJob(id);
  res.json({ success: true, data: { removed } });
}

export async function handleHistory(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const executions = await service.getHistory(id);
  res.json({ success: true, data: { executions } });
}

export async function handleRestore(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  const body = req.body as { executionId: string; targetPath?: string };
  const result = await service.restore(id, body.executionId, body.targetPath);
  res.json({ success: true, data: result });
}

export async function handleListSnapshots(req: Request, res: Response): Promise<void> {
  const pool = String(req.query['pool'] as string ?? '');
  const snapshots = await service.listSnapshots(pool);
  res.json({ success: true, data: { snapshots } });
}

export async function handleCreateSnapshot(req: Request, res: Response): Promise<void> {
  const body = req.body as { pool: string; name: string };
  const snapshot = await service.createSnapshot(body.pool, body.name);
  res.status(201).json({ success: true, data: { snapshot } });
}

export async function handleDeleteSnapshot(req: Request, res: Response): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const removed = await service.deleteSnapshot(name);
  res.json({ success: true, data: { removed } });
}
