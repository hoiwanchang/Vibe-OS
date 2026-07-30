/**
 * 模块：FTP/SFTP 服务管理 — 请求处理
 */
import type { Request, Response } from 'express';
import * as service from './ftp.service.js';
import type { FtpConfigUpdate, FtpUserPermissionUpdate } from './ftp.types.js';

/** GET /api/ftp/status — FTP/SFTP 服务状态 */
export async function handleGetStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const status = await service.getStatus();
  res.json({ success: true, data: status });
}

/** PUT /api/ftp/config — 更新 FTP/SFTP 配置 */
export async function handleUpdateConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as FtpConfigUpdate;
  const result = await service.updateConfig(body);
  res.json({ success: true, data: result });
}

/** POST /api/ftp/start — 启动 FTP 服务 */
export async function handleStart(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await service.startFtp();
  res.json({ success: true, data: result });
}

/** POST /api/ftp/stop — 停止 FTP 服务 */
export async function handleStop(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await service.stopFtp();
  res.json({ success: true, data: result });
}

/** POST /api/ftp/restart — 重启 FTP 服务 */
export async function handleRestart(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await service.restartFtp();
  res.json({ success: true, data: result });
}

/** GET /api/ftp/logs — FTP 连接日志 */
export async function handleGetLogs(
  req: Request,
  res: Response,
): Promise<void> {
  const limit = Number(req.query['limit'] ?? 100);
  const logs = await service.getLogs(limit);
  res.json({ success: true, data: logs });
}

/** GET /api/ftp/users/:uid — 获取用户 FTP 权限 */
export async function handleGetUserPermission(
  req: Request,
  res: Response,
): Promise<void> {
  const uid = Number(req.params['uid']);
  const perm = await service.getUserPermission(uid);
  res.json({ success: true, data: perm });
}

/** PUT /api/ftp/users/:uid — 更新用户 FTP 权限 */
export async function handleUpdateUserPermission(
  req: Request,
  res: Response,
): Promise<void> {
  const uid = Number(req.params['uid']);
  const body = req.body as FtpUserPermissionUpdate;
  const perm = await service.updateUserPermission(uid, body);
  res.json({ success: true, data: perm });
}
