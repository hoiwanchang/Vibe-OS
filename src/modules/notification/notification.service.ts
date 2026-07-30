/**
 * 模块：通知与告警 — 业务逻辑层
 * 使用 JSON 文件持久化（避免引入 better-sqlite3 原生依赖）
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { VIBEOS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import type { Notification, NotificationChannel } from './notification.types.js';

const DB_FILE = `${VIBEOS_APP_DIR}/notification/notifications.json`;
const SETTINGS_FILE = `${VIBEOS_APP_DIR}/notification/settings.json`;

async function loadNotifications(): Promise<Notification[]> {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, 'utf-8')) as Notification[];
  } catch { return []; }
}

async function saveNotifications(items: Notification[]): Promise<void> {
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

async function loadSettings(): Promise<NotificationChannel[]> {
  try {
    return JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf-8')) as NotificationChannel[];
  } catch { return []; }
}

async function saveSettings(channels: NotificationChannel[]): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
}

/** 发布通知（供其他模块调用） */
export async function emit(severity: Notification['severity'], category: Notification['category'], title: string, detail: string, source = 'system'): Promise<Notification> {
  const items = await loadNotifications();
  const notification: Notification = {
    id: randomUUID(),
    severity,
    category,
    title,
    detail,
    source,
    read: false,
    createdAt: new Date().toISOString(),
  };
  items.unshift(notification);
  // 保留最近 500 条
  if (items.length > 500) items.length = 500;
  await saveNotifications(items);

  // Webhook 推送
  const channels = await loadSettings();
  const severityOrder = { info: 0, warning: 1, critical: 2 };
  for (const ch of channels) {
    if (ch.enabled && ch.type === 'webhook' && ch.url && severityOrder[severity] >= severityOrder[ch.minSeverity]) {
      try {
        await fetch(ch.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notification),
        });
      } catch { /* 推送失败不阻塞 */ }
    }
  }
  return notification;
}

/** 列出通知 */
export async function list(limit: number, offset: number, severity?: string): Promise<{ notifications: Notification[]; total: number }> {
  let items = await loadNotifications();
  if (severity) items = items.filter((n) => n.severity === severity);
  const total = items.length;
  return { notifications: items.slice(offset, offset + limit), total };
}

/** 标记已读 */
export async function markRead(id: string): Promise<string> {
  const items = await loadNotifications();
  const item = items.find((n) => n.id === id);
  if (!item) throw AppError.notFound(`通知 [${id}]`);
  item.read = true;
  await saveNotifications(items);
  return id;
}

/** 全部已读 */
export async function markAllRead(): Promise<number> {
  const items = await loadNotifications();
  let count = 0;
  for (const item of items) {
    if (!item.read) { item.read = true; count++; }
  }
  await saveNotifications(items);
  return count;
}

/** 删除通知 */
export async function remove(id: string): Promise<string> {
  const items = await loadNotifications();
  const idx = items.findIndex((n) => n.id === id);
  if (idx === -1) throw AppError.notFound(`通知 [${id}]`);
  items.splice(idx, 1);
  await saveNotifications(items);
  return id;
}

/** 获取通知渠道配置 */
export async function getSettings(): Promise<NotificationChannel[]> {
  return loadSettings();
}

/** 修改通知配置 */
export async function updateSettings(channels: NotificationChannel[]): Promise<boolean> {
  await saveSettings(channels);
  return true;
}

/** 未读数量 */
export async function unreadCount(): Promise<number> {
  const items = await loadNotifications();
  return items.filter((n) => !n.read).length;
}
