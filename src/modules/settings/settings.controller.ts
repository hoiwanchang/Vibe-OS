/**
 * 模块：系统设置中心 — 请求处理
 */
import type { Request, Response } from 'express';
import * as service from './settings.service.js';
import { VALID_SECTIONS, type SettingsSection } from './settings.types.js';
import { AppError } from '../../common/app-error.js';

function assertSection(section: string): SettingsSection {
  if (!VALID_SECTIONS.includes(section as SettingsSection)) {
    throw AppError.badRequest(
      'INVALID_SECTION',
      `无效的设置分区: ${section}，可选: ${VALID_SECTIONS.join(', ')}`,
    );
  }
  return section as SettingsSection;
}

/** GET /api/settings — 完整配置 */
export async function handleGetAll(
  _req: Request,
  res: Response,
): Promise<void> {
  const settings = await service.loadSettings();
  res.json({ success: true, data: settings });
}

/** GET /api/settings/:section — 单个分区 */
export async function handleGetSection(
  req: Request,
  res: Response,
): Promise<void> {
  const section = assertSection(String(req.params['section'] ?? ''));
  const data = await service.getSection(section);
  res.json({ success: true, data });
}

/** PUT /api/settings/:section — 更新分区 */
export async function handleUpdateSection(
  req: Request,
  res: Response,
): Promise<void> {
  const section = assertSection(String(req.params['section'] ?? ''));
  const body = req.body as Record<string, unknown>;
  if (!body || Object.keys(body).length === 0) {
    throw AppError.badRequest('EMPTY_BODY', '请求体不能为空');
  }
  const result = await service.updateSection(section, body);
  res.json({ success: true, data: result });
}

/** GET /api/settings/services — 服务列表 */
export async function handleListServices(
  _req: Request,
  res: Response,
): Promise<void> {
  const services = await service.listServices();
  res.json({ success: true, data: { services } });
}

/** POST /api/settings/services/:name/toggle — 开关服务 */
export async function handleToggleService(
  req: Request,
  res: Response,
): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') {
    throw AppError.badRequest('INVALID_PARAM', 'enabled 必须为布尔值');
  }
  const result = await service.toggleService(name, enabled);
  res.json({ success: true, data: result });
}

/** POST /api/settings/services/:name/restart — 重启服务 */
export async function handleRestartService(
  req: Request,
  res: Response,
): Promise<void> {
  const name = String(req.params['name'] ?? '');
  const result = await service.restartService(name);
  res.json({ success: true, data: result });
}

/** GET /api/settings/about — 关于信息 */
export async function handleAbout(
  _req: Request,
  res: Response,
): Promise<void> {
  const about = await service.getAbout();
  res.json({ success: true, data: about });
}

/** GET /api/settings/logs/sources — 日志源列表 */
export async function handleLogSources(
  _req: Request,
  res: Response,
): Promise<void> {
  const sources = service.getLogSources();
  res.json({ success: true, data: { sources } });
}

/** GET /api/settings/logs — 读取日志 */
export async function handleReadLogs(
  req: Request,
  res: Response,
): Promise<void> {
  const source = (req.query['source'] as string) ?? 'system';
  const lines = parseInt((req.query['lines'] as string) ?? '200', 10);
  const level = req.query['level'] as string | undefined;
  const result = await service.readLogs(source, lines, level);
  res.json({ success: true, data: result });
}

/** DELETE /api/settings/logs/clear — 清空日志 */
export async function handleClearLogs(
  req: Request,
  res: Response,
): Promise<void> {
  const source = (req.query['source'] as string) ?? '';
  const result = await service.clearLogs(source);
  res.json({ success: true, data: result });
}

/** POST /api/settings/logs/export — 导出诊断包 */
export async function handleExportDiagnostics(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await service.exportDiagnostics();
  res.json({ success: true, data: result });
}

/** POST /api/settings/update/check — 检查更新 */
export async function handleCheckUpdate(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await service.checkUpdate();
  res.json({ success: true, data: result });
}

/** POST /api/settings/notification/test — 测试通知 */
export async function handleTestNotification(
  req: Request,
  res: Response,
): Promise<void> {
  const { channelType } = req.body as { channelType?: string };
  if (!channelType) {
    throw AppError.badRequest('INVALID_PARAM', 'channelType 不能为空');
  }
  const result = await service.testNotification(channelType);
  res.json({ success: true, data: result });
}

/** POST /api/system/reboot — 重启系统 */
export async function handleReboot(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await service.systemReboot();
  res.json({ success: true, data: result });
}

/** POST /api/system/shutdown — 关机 */
export async function handleShutdown(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await service.systemShutdown();
  res.json({ success: true, data: result });
}
