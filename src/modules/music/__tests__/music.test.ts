/**
 * 模块：音乐串流 — 单元测试
 * 覆盖所有端点：library / artists / albums / tracks / stream / cover / playlists / scan
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ===== Mocks =====

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockStat = vi.fn();
const mockReaddir = vi.fn();
const mockAccess = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  access: (...args: unknown[]) => mockAccess(...args),
}));

const mockCreateReadStream = vi.fn();
vi.mock('node:fs', () => ({
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
}));

const mockParseFile = vi.fn();
vi.mock('music-metadata', () => ({
  parseFile: (...args: unknown[]) => mockParseFile(...args),
}));

vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  SECRETS_DIR: '/data/vibeos/secrets',
  SYSTEM_CACHE_DIR: '/data/vibeos/cache',
  COMMAND_TIMEOUT_MS: 5000,
  PORT: 3000,
  HOST: '127.0.0.1',
  API_TOKEN: '',
  SSH_TARGET_USER: 'vibeuser',
  SSH_AUTHORIZED_KEYS_FILE: '',
  DEFAULT_QUOTA_BYTES: BigInt(100 * 1024 * 1024 * 1024),
  USER_SUBDIRS: ['files', 'config', 'cache'],
  APP_SUBDIRS: ['models', 'data', 'logs'],
  AUTH_DISABLED: true,
  ADMIN_PASSWORD: 'vibeos',
  SESSION_TTL_MS: 86400000,
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCK_MS: 900000,
  OIDC_ISSUER: 'http://127.0.0.1:3000',
  ACCESS_TOKEN_TTL_S: 3600,
  REFRESH_TOKEN_TTL_MS: 2592000000,
  AUTH_CODE_TTL_MS: 600000,
  SESSION_COOKIE_NAME: 'vibeos.sid',
  IS_PRODUCTION: false,
  FORCE_2FA: false,
}));

import * as service from '../music.service.js';
import { AppError } from '../../../common/app-error.js';

// ===== 测试数据 =====

function makeMeta(overrides: Record<string, unknown> = {}) {
  return {
    common: {
      title: '测试曲目',
      artist: '测试艺术家',
      album: '测试专辑',
      year: 2024,
      genre: ['Rock'],
      track: { no: 1 },
      disk: { no: 1 },
      picture: [{ data: new Uint8Array([1, 2, 3]), format: 'image/jpeg' }],
      ...(overrides['common'] as Record<string, unknown> ?? {}),
    },
    format: {
      duration: 240,
      codec: 'MP3',
      bitrate: 320000,
      sampleRate: 44100,
      container: 'MPEG',
      ...(overrides['format'] as Record<string, unknown> ?? {}),
    },
  };
}

// ===== Service 测试 =====

describe('音乐串流 Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.invalidateCache();
  });

  describe('scanLibrary', () => {
    it('应扫描 /data/ 下音频文件并读取元数据', async () => {
      // 模拟目录结构: /data/music/test.mp3
      mockReaddir.mockImplementation((dir: string) => {
        if (dir === '/data') {
          return Promise.resolve([
            { name: 'music', isDirectory: () => true, isFile: () => false },
            { name: 'vibeos', isDirectory: () => true, isFile: () => false },
          ]);
        }
        if (dir === '/data/music') {
          return Promise.resolve([
            { name: 'test.mp3', isDirectory: () => false, isFile: () => true },
            { name: 'readme.txt', isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });
      mockParseFile.mockResolvedValue(makeMeta());
      mockStat.mockResolvedValue({ size: 5_000_000 });
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const tracks = await service.scanLibrary();
      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.title).toBe('测试曲目');
      expect(tracks[0]?.artist).toBe('测试艺术家');
      expect(tracks[0]?.format).toBe('MP3');
    });

    it('空目录应返回空列表', async () => {
      mockReaddir.mockResolvedValue([]);
      const tracks = await service.scanLibrary();
      expect(tracks).toEqual([]);
    });

    it('应跳过隐藏目录', async () => {
      mockReaddir.mockImplementation((dir: string) => {
        if (dir === '/data') {
          return Promise.resolve([
            { name: '.hidden', isDirectory: () => true, isFile: () => false },
            { name: 'song.flac', isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });
      mockParseFile.mockResolvedValue(makeMeta());
      mockStat.mockResolvedValue({ size: 1000 });
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const tracks = await service.scanLibrary();
      expect(tracks).toHaveLength(1);
    });

    it('元数据读取失败应使用回退值', async () => {
      mockReaddir.mockImplementation((dir: string) => {
        if (dir === '/data') {
          return Promise.resolve([
            { name: 'bad.mp3', isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });
      mockParseFile.mockRejectedValue(new Error('parse error'));
      mockStat.mockResolvedValue({ size: 100 });
      mockAccess.mockRejectedValue(new Error('ENOENT'));

      const tracks = await service.scanLibrary();
      expect(tracks).toHaveLength(1);
      expect(tracks[0]?.title).toBe('bad');
      expect(tracks[0]?.artist).toBe('未知艺术家');
    });
  });

  describe('listTracks', () => {
    beforeEach(async () => {
      // 预填缓存
      mockReaddir.mockImplementation((dir: string) => {
        if (dir === '/data') {
          return Promise.resolve([
            { name: 'a.mp3', isDirectory: () => false, isFile: () => true },
            { name: 'b.flac', isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });
      mockParseFile
        .mockResolvedValueOnce(makeMeta())
        .mockResolvedValueOnce(makeMeta({
          common: { title: '另一首', artist: '艺术家B', album: '专辑B', track: { no: 2 }, disk: { no: 1 }, genre: ['Pop'], picture: [] },
        }));
      mockStat.mockResolvedValue({ size: 1000 });
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      await service.scanLibrary();
    });

    it('应返回分页结果', async () => {
      const result = await service.listTracks({ page: 1, pageSize: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(2);
      expect(result.totalPages).toBe(2);
    });

    it('应按搜索词过滤', async () => {
      const result = await service.listTracks({ search: '艺术家B', page: 1, pageSize: 50 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.artist).toBe('艺术家B');
    });

    it('第二页应返回剩余曲目', async () => {
      const result = await service.listTracks({ page: 2, pageSize: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.page).toBe(2);
    });
  });

  describe('listArtists', () => {
    it('应聚合艺术家信息', async () => {
      mockReaddir.mockImplementation((dir: string) => {
        if (dir === '/data') {
          return Promise.resolve([
            { name: 'a.mp3', isDirectory: () => false, isFile: () => true },
            { name: 'b.mp3', isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });
      mockParseFile
        .mockResolvedValueOnce(makeMeta())
        .mockResolvedValueOnce(makeMeta({ common: { title: '曲目2', artist: '测试艺术家', album: '专辑2', track: { no: 1 }, disk: { no: 1 }, genre: [], picture: [] } }));
      mockStat.mockResolvedValue({ size: 100 });
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      await service.scanLibrary();

      const artists = await service.listArtists();
      expect(artists).toHaveLength(1);
      expect(artists[0]?.name).toBe('测试艺术家');
      expect(artists[0]?.trackCount).toBe(2);
      expect(artists[0]?.albumCount).toBe(2);
    });
  });

  describe('listAlbums', () => {
    it('应聚合专辑信息', async () => {
      mockReaddir.mockImplementation((dir: string) => {
        if (dir === '/data') {
          return Promise.resolve([
            { name: 'a.mp3', isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });
      mockParseFile.mockResolvedValue(makeMeta());
      mockStat.mockResolvedValue({ size: 100 });
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      await service.scanLibrary();

      const albums = await service.listAlbums();
      expect(albums).toHaveLength(1);
      expect(albums[0]?.name).toBe('测试专辑');
      expect(albums[0]?.artist).toBe('测试艺术家');
    });
  });

  describe('getTrackById', () => {
    it('不存在应抛 404', async () => {
      mockReaddir.mockResolvedValue([]);
      await service.scanLibrary();
      await expect(service.getTrackById('nonexistent')).rejects.toThrow(AppError);
    });
  });

  describe('getTrackFilePath', () => {
    it('文件不存在应抛 404', async () => {
      mockReaddir.mockImplementation((dir: string) => {
        if (dir === '/data') {
          return Promise.resolve([
            { name: 'a.mp3', isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });
      mockParseFile.mockResolvedValue(makeMeta());
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      // stat 第一次用于 scanLibrary 的 size，第二次用于 getTrackFilePath
      mockStat
        .mockResolvedValueOnce({ size: 100 })
        .mockRejectedValueOnce(new Error('ENOENT'));
      await service.scanLibrary();

      const tracks = await service.getTracks();
      const id = tracks[0]?.id ?? '';
      await expect(service.getTrackFilePath(id)).rejects.toThrow(AppError);
    });
  });

  describe('getTrackCover', () => {
    it('应从 ID3 标签提取嵌入封面', async () => {
      mockReaddir.mockImplementation((dir: string) => {
        if (dir === '/data') {
          return Promise.resolve([
            { name: 'a.mp3', isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });
      mockParseFile.mockResolvedValue(makeMeta());
      mockStat.mockResolvedValue({ size: 100 });
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      await service.scanLibrary();

      const tracks = await service.getTracks();
      const id = tracks[0]?.id ?? '';

      // 第二次 parseFile 调用用于 getTrackCover
      mockParseFile.mockResolvedValue(makeMeta());
      const cover = await service.getTrackCover(id);
      expect(cover.mimeType).toBe('image/jpeg');
      expect(cover.buffer).toBeInstanceOf(Buffer);
    });

    it('无嵌入封面应尝试目录 cover.jpg', async () => {
      mockReaddir.mockImplementation((dir: string) => {
        if (dir === '/data') {
          return Promise.resolve([
            { name: 'a.mp3', isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });
      // 无嵌入封面
      mockParseFile.mockResolvedValue(makeMeta({ common: { picture: [] } }));
      mockStat.mockResolvedValue({ size: 100 });
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      await service.scanLibrary();

      const tracks = await service.getTracks();
      const id = tracks[0]?.id ?? '';

      // getTrackCover: parseFile 无封面 → 尝试 cover.jpg
      mockParseFile.mockResolvedValue(makeMeta({ common: { picture: [] } }));
      mockReadFile.mockResolvedValue(Buffer.from([0xFF, 0xD8]));
      const cover = await service.getTrackCover(id);
      expect(cover.mimeType).toBe('image/jpeg');
    });

    it('无任何封面应抛 404', async () => {
      mockReaddir.mockImplementation((dir: string) => {
        if (dir === '/data') {
          return Promise.resolve([
            { name: 'a.mp3', isDirectory: () => false, isFile: () => true },
          ]);
        }
        return Promise.resolve([]);
      });
      mockParseFile.mockResolvedValue(makeMeta({ common: { picture: [] } }));
      mockStat.mockResolvedValue({ size: 100 });
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      await service.scanLibrary();

      const tracks = await service.getTracks();
      const id = tracks[0]?.id ?? '';

      mockParseFile.mockResolvedValue(makeMeta({ common: { picture: [] } }));
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      await expect(service.getTrackCover(id)).rejects.toThrow(AppError);
    });
  });

  describe('播放列表 CRUD', () => {
    it('创建播放列表', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const pl = await service.createPlaylist({ name: '我的歌单', trackIds: ['t1', 't2'] });
      expect(pl.name).toBe('我的歌单');
      expect(pl.trackIds).toEqual(['t1', 't2']);
      expect(pl.id).toBeTruthy();
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('列出播放列表', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([
        { id: 'pl1', name: '歌单1', trackIds: ['t1'], createdAt: '', updatedAt: '' },
      ]));
      const pls = await service.listPlaylists();
      expect(pls).toHaveLength(1);
      expect(pls[0]?.name).toBe('歌单1');
    });

    it('无播放列表文件应返回空', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const pls = await service.listPlaylists();
      expect(pls).toEqual([]);
    });

    it('删除播放列表', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([
        { id: 'pl1', name: '歌单1', trackIds: [], createdAt: '', updatedAt: '' },
      ]));
      const removed = await service.deletePlaylist('pl1');
      expect(removed).toBe('pl1');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('删除不存在的播放列表应 404', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));
      await expect(service.deletePlaylist('nope')).rejects.toThrow(AppError);
    });

    it('更新播放列表 — 重命名', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([
        { id: 'pl1', name: '旧名', trackIds: ['t1'], createdAt: '', updatedAt: '' },
      ]));
      const updated = await service.updatePlaylist('pl1', { name: '新名' });
      expect(updated.name).toBe('新名');
    });

    it('更新播放列表 — 增删曲目', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([
        { id: 'pl1', name: '歌单', trackIds: ['t1', 't2'], createdAt: '', updatedAt: '' },
      ]));
      const updated = await service.updatePlaylist('pl1', {
        addTrackIds: ['t3'],
        removeTrackIds: ['t1'],
      });
      expect(updated.trackIds).toContain('t2');
      expect(updated.trackIds).toContain('t3');
      expect(updated.trackIds).not.toContain('t1');
    });

    it('更新不存在的播放列表应 404', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));
      await expect(service.updatePlaylist('nope', { name: 'x' })).rejects.toThrow(AppError);
    });
  });
});

// ===== API 集成测试 =====

describe('音乐串流 API', () => {
  let app: import('express').Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    service.invalidateCache();

    // 默认：空音乐库
    mockReaddir.mockResolvedValue([]);
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockWriteFile.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({ size: 1000 });
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    // 构建最小 Express 应用（仅挂载 music 路由 + 错误处理）
    const express = (await import('express')).default;
    const { errorHandler } = await import('../../../common/error-handler.js');
    const { default: musicRouter } = await import('../music.routes.js');
    app = express();
    app.use(express.json());
    app.use('/api', musicRouter);
    app.use(errorHandler);
  });

  it('GET /api/music/library 应返回层级结构', async () => {
    const res = await request(app).get('/api/music/library');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('artists');
    expect(res.body.data).toHaveProperty('albums');
    expect(res.body.data).toHaveProperty('tracks');
    expect(res.body.data).toHaveProperty('totalArtists');
    expect(res.body.data).toHaveProperty('totalAlbums');
    expect(res.body.data).toHaveProperty('totalTracks');
  });

  it('GET /api/music/library?search= 应支持搜索', async () => {
    const res = await request(app).get('/api/music/library?search=test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/music/artists 应返回艺术家列表', async () => {
    const res = await request(app).get('/api/music/artists');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.artists).toBeInstanceOf(Array);
  });

  it('GET /api/music/albums 应返回专辑列表', async () => {
    const res = await request(app).get('/api/music/albums');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.albums).toBeInstanceOf(Array);
  });

  it('GET /api/music/tracks 应返回分页曲目', async () => {
    const res = await request(app).get('/api/music/tracks?page=1&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('page');
    expect(res.body.data).toHaveProperty('pageSize');
    expect(res.body.data).toHaveProperty('totalPages');
  });

  it('GET /api/music/tracks?artistId= 应支持过滤', async () => {
    const res = await request(app).get('/api/music/tracks?artistId=ar_test');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/music/tracks/:id/stream 不存在应 404', async () => {
    const res = await request(app).get('/api/music/tracks/nonexistent/stream');
    expect(res.status).toBe(404);
  });

  it('GET /api/music/tracks/:id/cover 不存在应 404', async () => {
    const res = await request(app).get('/api/music/tracks/nonexistent/cover');
    expect(res.status).toBe(404);
  });

  it('GET /api/music/playlists 应返回播放列表', async () => {
    const res = await request(app).get('/api/music/playlists');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.playlists).toBeInstanceOf(Array);
  });

  it('POST /api/music/playlists 应创建播放列表', async () => {
    const res = await request(app)
      .post('/api/music/playlists')
      .send({ name: '新歌单', trackIds: ['t1', 't2'] });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.playlist.name).toBe('新歌单');
  });

  it('POST /api/music/playlists 缺少 name 应 400', async () => {
    const res = await request(app)
      .post('/api/music/playlists')
      .send({ trackIds: ['t1'] });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/music/playlists/:id 不存在应 404', async () => {
    const res = await request(app).delete('/api/music/playlists/nonexistent');
    expect(res.status).toBe(404);
  });

  it('PUT /api/music/playlists/:id 不存在应 404', async () => {
    const res = await request(app)
      .put('/api/music/playlists/nonexistent')
      .send({ name: '新名' });
    expect(res.status).toBe(404);
  });

  it('POST /api/music/scan 应触发扫描', async () => {
    const res = await request(app).post('/api/music/scan');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('scanned');
  });
});
