/**
 * 模块：音乐串流 — 类型定义
 */

/** 音频文件扩展名 */
export const AUDIO_EXTENSIONS = ['.mp3', '.flac', '.ogg', '.wav', '.m4a'] as const;

/** 曲目 */
export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  trackNumber: number | null;
  discNumber: number | null;
  year: number | null;
  genre: string | null;
  format: string;
  bitrate: number | null;
  sampleRate: number | null;
  size: number;
  filePath: string;
  hasCover: boolean;
}

/** 艺术家 */
export interface Artist {
  id: string;
  name: string;
  albumCount: number;
  trackCount: number;
}

/** 专辑 */
export interface Album {
  id: string;
  name: string;
  artist: string;
  year: number | null;
  trackCount: number;
  hasCover: boolean;
}

/** 播放列表 */
export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** 创建播放列表请求 */
export interface CreatePlaylistInput {
  name: string;
  trackIds: string[];
}

/** 更新播放列表请求 */
export interface UpdatePlaylistInput {
  name?: string;
  addTrackIds?: string[];
  removeTrackIds?: string[];
}

/** 音乐库层级视图 */
export interface LibraryView {
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
  totalArtists: number;
  totalAlbums: number;
  totalTracks: number;
}

/** 分页参数 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
