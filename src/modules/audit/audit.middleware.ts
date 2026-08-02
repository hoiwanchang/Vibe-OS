/**
 * 模块：审计日志 — Express 中间件
 * 记录所有 API 操作：who / what / when / where / result
 * 挂载在 app.use() 层级，通过 res 'finish' 事件捕获最终状态码
 */
import type { NextFunction, Request, Response } from 'express';
import * as service from './audit.service.js';

/**
 * 审计日志中间件
 * 在响应完成后异步写入审计记录，不阻塞请求链路
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 仅记录 /api/ 路径的请求
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  // 在中间件执行时捕获 path/method，避免子路由挂载（app.use('/api', router)）
  // 修改 req.url 后 finish 回调中读到被剥离前缀的路径
  const requestPath = req.path;
  const requestMethod = req.method;

  res.on('finish', () => {
    try {
      const uid = req.user?.uid ?? -1;
      const username = req.user?.username ?? 'anonymous';
      const ip =
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
        req.socket.remoteAddress ??
        'unknown';

      service.recordLog({
        uid,
        username,
        method: requestMethod,
        path: requestPath,
        status: res.statusCode,
        ip,
      });
    } catch {
      // 审计写入失败不应影响业务
    }
  });

  next();
}
