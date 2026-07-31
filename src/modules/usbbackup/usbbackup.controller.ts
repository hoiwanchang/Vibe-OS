/**
 * 模块：USB 外设备份 — 控制器层
 */
import type { Request, Response } from 'express';
import * as service from './usbbackup.service.js';
import type {
  UpdateUsbBackupConfigRequest,
  ExecuteBackupRequest,
} from './usbbackup.types.js';

/** GET /api/usbbackup/devices — 检测 USB 设备 */
export async function handleGetDevices(
  _req: Request,
  res: Response,
): Promise<void> {
  const devices = await service.getDevices();
  res.json({ success: true, data: { devices } });
}

/** GET /api/usbbackup/config — 获取备份配置 */
export async function handleGetConfig(
  _req: Request,
  res: Response,
): Promise<void> {
  const config = await service.getConfig();
  res.json({ success: true, data: config });
}

/** PUT /api/usbbackup/config — 更新备份配置 */
export async function handleUpdateConfig(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as UpdateUsbBackupConfigRequest;
  const config = await service.updateConfig(body);
  res.json({ success: true, data: config });
}

/** POST /api/usbbackup/execute — 执行备份任务 */
export async function handleExecute(
  req: Request,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as ExecuteBackupRequest;
  const task = await service.executeBackup(body);
  res.json({ success: true, data: { task } });
}

/** GET /api/usbbackup/status — 获取当前任务状态 */
export async function handleGetStatus(
  _req: Request,
  res: Response,
): Promise<void> {
  const status = await service.getStatus();
  res.json({ success: true, data: status });
}

/** GET /api/usbbackup/history — 获取备份历史 */
export async function handleGetHistory(
  _req: Request,
  res: Response,
): Promise<void> {
  const history = await service.getHistory();
  res.json({ success: true, data: { history } });
}
