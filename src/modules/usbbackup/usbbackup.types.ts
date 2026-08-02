/**
 * 模块：USB 外设备份 — 类型定义
 */

/** USB 设备信息（lsblk 解析） */
export interface UsbDevice {
  /** 设备名（如 sdb） */
  name: string;
  /** 设备标签 */
  label: string | null;
  /** 设备大小（人类可读，如 "32G"） */
  size: string;
  /** 设备类型（disk / part） */
  type: string;
  /** 挂载点 */
  mountpoint: string | null;
  /** 文件系统类型 */
  fstype: string | null;
  /** 设备型号 */
  model: string | null;
  /** 厂商 */
  vendor: string | null;
  /** 传输方式（usb / sata 等） */
  tran: string | null;
  /** 子分区 */
  children: UsbDevice[];
}

/** 备份策略 */
export type BackupStrategy = 'copy' | 'rsync' | 'bidirectional';

/** USB 备份配置 */
export interface UsbBackupConfig {
  /** 备份策略 */
  strategy: BackupStrategy;
  /** 源路径 */
  sourcePath: string;
  /** 目标路径（USB 挂载点或子目录） */
  targetPath: string;
  /** 是否自动备份（设备插入时） */
  autoBackup: boolean;
  /** 排除模式列表 */
  excludePatterns: string[];
}

/** 更新配置请求 */
export interface UpdateUsbBackupConfigRequest {
  strategy?: BackupStrategy;
  sourcePath?: string;
  targetPath?: string;
  autoBackup?: boolean;
  excludePatterns?: string[];
}

/** 备份任务状态 */
export type BackupTaskStatus = 'idle' | 'running' | 'success' | 'failed';

/** 备份任务（当前执行中/最近一次） */
export interface BackupTask {
  /** 任务 ID */
  id: string;
  /** 备份策略 */
  strategy: BackupStrategy;
  /** 源路径 */
  source: string;
  /** 目标路径 */
  target: string;
  /** 任务状态 */
  status: BackupTaskStatus;
  /** 开始时间（ISO 8601） */
  startedAt: string;
  /** 完成时间（ISO 8601） */
  finishedAt: string | null;
  /** 传输文件数 */
  filesTransferred: number;
  /** 传输字节数 */
  bytesTransferred: number;
  /** 错误信息 */
  error: string | null;
}

/** 备份历史记录条目 */
export interface BackupHistoryEntry {
  /** 记录 ID */
  id: string;
  /** 备份策略 */
  strategy: BackupStrategy;
  /** 源路径 */
  source: string;
  /** 目标路径 */
  target: string;
  /** 最终状态 */
  status: 'success' | 'failed';
  /** 开始时间 */
  startedAt: string;
  /** 完成时间 */
  finishedAt: string;
  /** 传输文件数 */
  filesTransferred: number;
  /** 传输字节数 */
  bytesTransferred: number;
  /** 错误信息 */
  error: string | null;
}

/** 执行备份请求 */
export interface ExecuteBackupRequest {
  /** 覆盖策略（可选，不传则用配置中的） */
  strategy?: BackupStrategy;
  /** 覆盖源路径（可选） */
  sourcePath?: string;
  /** 覆盖目标路径（可选） */
  targetPath?: string;
}
