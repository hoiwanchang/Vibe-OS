/**
 * 模块：全文搜索 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './search.service.js';
import type { SearchParams } from './search.types.js';

/** 解析正整数查询参数，非法或缺失返回默认值 */
function intParam(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 解析字符串查询参数，空返回 undefined */
function strParam(value: string | undefined): string | undefined {
  return value === '' || value === undefined ? undefined : value;
}

/** GET /api/search */
export function handleSearch(req: Request, res: Response): void {
  const params: SearchParams = {
    uid: intParam(req.query['uid'] as string | undefined, NaN),
    q: (req.query['q'] as string | undefined) ?? '',
    type: strParam(req.query['type'] as string | undefined),
    path: strParam(req.query['path'] as string | undefined),
    from: strParam(req.query['from'] as string | undefined),
    to: strParam(req.query['to'] as string | undefined),
    page: intParam(req.query['page'] as string | undefined, 1),
    size: intParam(req.query['size'] as string | undefined, 20),
  };
  const data = service.searchFiles(params);
  res.json({ success: true, data });
}

/** GET /api/search/status */
export function handleStatus(req: Request, res: Response): void {
  const uid = intParam(req.query['uid'] as string | undefined, NaN);
  const data = service.getIndexStatus(uid);
  res.json({ success: true, data });
}

/** POST /api/search/reindex */
export function handleReindex(req: Request, res: Response): void {
  const body = req.body as { uid: number };
  const data = service.reindex(body.uid);
  res.json({ success: true, data });
}
