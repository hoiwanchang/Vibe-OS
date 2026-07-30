/**
 * 模块：DLNA/UPnP 媒体服务器 — 类型定义
 * 基于 minidlna (ReadyMedia) 实现 DLNA 媒体共享
 */

/** 媒体源类型 */
export type MediaType = 'video' | 'music' | 'photo';

/** 媒体源配置 */
export interface MediaSource {
  /** 媒体目录路径 */
  path: string;
  /** 媒体类型 */
  type: MediaType;
}

/** 媒体库配置请求 */
export interface MediaConfigRequest {
  /** 媒体源列表 */
  sources: MediaSource[];
  /** 是否启用 inotify 自动监控 */
  inotify: boolean;
  /** DLNA 服务端口 */
  port: number;
}

/** DLNA 服务状态 */
export interface MediaStatus {
  /** 服务是否运行中 */
  running: boolean;
  /** 进程 PID（运行时） */
  pid: number | null;
  /** 视频数量 */
  videoCount: number;
  /** 音乐数量 */
  musicCount: number;
  /** 照片数量 */
  photoCount: number;
  /** 当前配置 */
  config: MediaConfig | null;
}

/** 持久化媒体配置 */
export interface MediaConfig {
  /** 媒体源列表 */
  sources: MediaSource[];
  /** 是否启用 inotify */
  inotify: boolean;
  /** DLNA 服务端口 */
  port: number;
}

/** 已连接客户端信息 */
export interface MediaClient {
  /** 客户端 IP 地址 */
  ip: string;
  /** 客户端名称/UA */
  name: string;
  /** 连接时间 */
  connectedAt: string;
}

/** 操作结果 */
export interface MediaResult {
  /** 消息 */
  message: string;
}
