/**
 * 模块：应用自动更新 — 类型定义
 */

/** 更新策略配置 */
export interface UpdateConfig {
  /** 更新模式：手动 / 自动 */
  mode: 'manual' | 'auto';
  /** 维护窗口（cron 表达式或时间范围，如 "02:00-04:00"） */
  maintenanceWindow?: string;
  /** 上次检查时间（ISO 8601） */
  lastCheckAt: string | null;
}

/** 可用更新条目 */
export interface AvailableUpdate {
  /** 应用标识（容器名） */
  appId: string;
  /** 容器名 */
  containerName: string;
  /** Docker 镜像（含 tag） */
  image: string;
  /** 当前本地镜像 ID */
  currentImageId: string;
  /** 远端最新镜像 ID */
  latestImageId: string;
  /** 检测时间（ISO 8601） */
  detectedAt: string;
}

/** 更新历史条目 */
export interface UpdateHistoryEntry {
  /** 唯一 ID */
  id: string;
  /** 应用标识 */
  appId: string;
  /** 容器名 */
  containerName: string;
  /** Docker 镜像 */
  image: string;
  /** 更新前镜像 ID */
  previousImageId: string;
  /** 更新后镜像 ID */
  newImageId: string;
  /** 开始时间 */
  startedAt: string;
  /** 完成时间 */
  finishedAt: string;
  /** 更新结果 */
  status: 'success' | 'failed';
  /** 失败原因 */
  error?: string;
}

/** 更新服务状态 */
export interface UpdateStatus {
  /** 更新模式 */
  mode: 'manual' | 'auto';
  /** 维护窗口 */
  maintenanceWindow: string | null;
  /** 上次检查时间 */
  lastCheckAt: string | null;
  /** 可用更新数量 */
  availableCount: number;
}
