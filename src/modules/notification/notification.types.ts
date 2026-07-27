/**
 * 模块：通知与告警 — 类型定义
 */
export interface Notification {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'disk' | 'service' | 'backup' | 'network' | 'security' | 'system';
  title: string;
  detail: string;
  source: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationChannel {
  type: 'webhook' | 'email';
  enabled: boolean;
  url?: string;
  minSeverity: 'info' | 'warning' | 'critical';
}
