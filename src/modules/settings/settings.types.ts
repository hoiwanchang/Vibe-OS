/**
 * 模块：系统设置中心 — 类型定义
 */

/* ---------- 常规 ---------- */

export interface GeneralSettings {
  hostname: string;
  timezone: string;
  locale: string;
  ntpEnabled: boolean;
  ntpServer: string;
  description: string;
}

/* ---------- 服务管理 ---------- */

export interface ManagedService {
  name: string;
  displayName: string;
  description: string;
  enabled: boolean;
  running: boolean;
  pid: number | null;
  uptime: number | null;
}

/* ---------- 安全 ---------- */

export interface SecuritySettings {
  httpsEnabled: boolean;
  httpsPort: number;
  httpsCertPath: string;
  httpsKeyPath: string;
  sshEnabled: boolean;
  sshPort: number;
  sshPasswordAuth: boolean;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  ipBlacklist: string[];
  ipWhitelist: string[];
  firewallEnabled: boolean;
  autoSecurityUpdates: boolean;
}

/* ---------- 存储策略 ---------- */

export interface StoragePolicySettings {
  diskSpindownMinutes: number;
  hddStandbyEnabled: boolean;
  smartCheckInterval: number;
  smartEmailAlert: boolean;
  trashRetentionDays: number;
  autoDefrag: boolean;
  writeCache: 'enabled' | 'disabled';
}

/* ---------- 电源管理 ---------- */

export interface PowerSettings {
  upsEnabled: boolean;
  upsDevice: string;
  upsShutdownThreshold: number;
  scheduledPowerOn: { enabled: boolean; time: string };
  scheduledShutdown: { enabled: boolean; time: string };
  idleShutdown: { enabled: boolean; minutes: number };
  wakeOnLan: boolean;
}

/* ---------- 通知 ---------- */

export interface NotificationChannel {
  id: string;
  type: 'webhook' | 'email';
  name: string;
  enabled: boolean;
  url?: string;
  emailTo?: string;
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  minSeverity: 'info' | 'warning' | 'critical';
}

export interface NotificationSettings {
  channels: NotificationChannel[];
  globalMinSeverity: 'info' | 'warning' | 'critical';
  quietHoursStart: string;
  quietHoursEnd: string;
}

/* ---------- 更新 ---------- */

export interface UpdateSettings {
  autoCheck: boolean;
  autoInstall: boolean;
  channel: 'stable' | 'beta';
  lastCheck: string | null;
  currentVersion: string;
}

/* ---------- 聚合 ---------- */

export interface SystemSettings {
  general: GeneralSettings;
  security: SecuritySettings;
  storage: StoragePolicySettings;
  power: PowerSettings;
  notification: NotificationSettings;
  update: UpdateSettings;
}

export type SettingsSection = keyof SystemSettings;

export const VALID_SECTIONS: SettingsSection[] = [
  'general',
  'security',
  'storage',
  'power',
  'notification',
  'update',
];

/* ---------- 日志 ---------- */

export interface LogLine {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

export interface LogSource {
  id: string;
  name: string;
  description: string;
  sizeBytes: number;
}

/* ---------- 关于 ---------- */

export interface AboutInfo {
  version: string;
  buildDate: string;
  nodeVersion: string;
  osVersion: string;
  kernel: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  hostname: string;
  uptimeSeconds: number;
  dataRoot: string;
  license: string;
}
