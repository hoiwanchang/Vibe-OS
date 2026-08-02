/**
 * 模块：视频转码 — 类型定义
 * 基于 ffmpeg 实现视频转码队列
 */

/** 转码预设 */
export type TranscodePreset = '1080p' | '720p' | '480p' | 'original';

/** 硬件加速方式 */
export type HwAccelType = 'auto' | 'vaapi' | 'nvenc' | 'none';

/** 任务状态 */
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** 创建转码任务请求 */
export interface CreateTranscodeRequest {
  /** 输入文件路径 */
  inputPath: string;
  /** 输出文件路径（可选，默认自动生成） */
  outputPath?: string;
  /** 转码预设 */
  preset: TranscodePreset;
  /** 硬件加速方式 */
  hwAccel?: HwAccelType;
}

/** 转码任务信息 */
export interface TranscodeTask {
  /** 任务 ID */
  id: string;
  /** 输入文件路径 */
  inputPath: string;
  /** 输出文件路径 */
  outputPath: string;
  /** 转码预设 */
  preset: TranscodePreset;
  /** 硬件加速方式 */
  hwAccel: HwAccelType;
  /** 任务状态 */
  status: TaskStatus;
  /** 进度百分比 (0-100) */
  progress: number;
  /** 错误信息（失败时） */
  error?: string;
  /** 创建时间 */
  createdAt: string;
  /** 开始时间（运行时） */
  startedAt?: string;
  /** 完成时间 */
  finishedAt?: string;
}

/** 硬件加速能力 */
export interface HwAccelInfo {
  /** VAAPI 是否可用 */
  vaapi: boolean;
  /** NVENC 是否可用 */
  nvenc: boolean;
  /** 可用的加速器列表 */
  available: HwAccelType[];
  /** 详细信息 */
  details: string;
}

/** 操作结果 */
export interface TranscodeResult {
  /** 任务 ID */
  taskId: string;
  /** 消息 */
  message: string;
}
