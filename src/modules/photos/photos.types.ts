/**
 * 模块：照片管理 — 类型定义
 */

/** 照片条目 */
export interface PhotoItem {
  id: string;
  path: string;
  filename: string;
  width: number;
  height: number;
  takenAt: string | null;
  camera: string | null;
  gps: { lat: number; lng: number } | null;
}

/** 时间线分组 */
export interface PhotoTimelineGroup {
  date: string;
  photos: PhotoItem[];
}

/** 相册 */
export interface PhotoAlbum {
  id: string;
  name: string;
  description: string;
  coverId: string | null;
  photoIds: string[];
  createdAt: string;
}

/** 共享链接 */
export interface PhotoShareLink {
  token: string;
  photoIds: string[];
  expiresAt: string;
}

/** 创建相册请求 */
export interface CreateAlbumRequest {
  name: string;
  description?: string;
}

/** 添加照片到相册请求 */
export interface AddPhotosRequest {
  photoIds: string[];
}

/** 创建共享链接请求 */
export interface CreateShareRequest {
  photoIds: string[];
  expiresInHours: number;
}
