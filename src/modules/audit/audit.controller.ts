/**
 * 模块：审计日志 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './audit.service.js';
import type { AuditQueryParams, ExportParams } from './audit.types.js';

/** 解析正整数查询参数，非法或缺失返回默认值 */
function intParam(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 解析字符串查询参数，空返回 undefined */
function strParam(value: string | undefined): string | undefined {
  return value === '' || value === undefined ? undefined : value;
}

/** GET /api/audit/logs */
export function handleQueryLogs(req: Request, res: Response): void {
  const params: AuditQueryParams = {
    user: strParam(req.query['user'] as string | undefined),
    action: strParam(req.query['action'] as string | undefined),
    from: strParam(req.query['from'] as string | undefined),
    to: strParam(req.query['to'] as string | undefined),
    page: intParam(req.query['page'] as string | undefined, 1),
    size: intParam(req.query['size'] as string | undefined, 20),
  };
  const data = service.queryLogs(params);
  res.json({ success: true, data });
}

/** GET /api/audit/stats */
export function handleStats(_req: Request, res: Response): void {
  const data = service.getStats();
  res.json({ success: true, data });
}

/** POST /api/audit/export */
export function handleExport(req: Request, res: Response): void {
  const body = req.body as ExportParams;
  const result = service.exportLogs(body);

  if (body.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    res.send(result);
  } else {
    res.json({ success: true, data: result });
  }
}

/** POST /api/audit/rotate */
export function handleRotate(_req: Request, res: Response): void {
  const deleted = service.rotateLogs();
  res.json({ success: true, data: { deleted } });
}
