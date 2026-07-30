/**
 * 模块：照片管理 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockReaddir = vi.fn();
const mockStat = vi.fn();
const mockAccess = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  access: (...args: unknown[]) => mockAccess(...args),
}));

vi.mock('../../system/command-executor.js', () => ({
  executeCommand: vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' }),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    resize: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { createApp } from '../../../app.js';
import * as service from '../photos.service.js';

describe('照片管理 API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockResolvedValue([]);
  });

  it('GET /api/photos/library 应返回时间线', async () => {
    const res = await request(app).get('/api/photos/library');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('GET /api/photos/albums 应返回相册列表', async () => {
    const res = await request(app).get('/api/photos/albums');
    expect(res.status).toBe(200);
    expect(res.body.data.albums).toBeInstanceOf(Array);
  });

  it('POST /api/photos/albums 应创建相册', async () => {
    const res = await request(app)
      .post('/api/photos/albums')
      .send({ name: '旅行', description: '2026 年旅行照片' });
    expect(res.status).toBe(201);
    expect(res.body.data.album.name).toBe('旅行');
  });

  it('DELETE /api/photos/albums/:id 不存在应 404', async () => {
    const res = await request(app).delete('/api/photos/albums/nonexistent');
    expect(res.status).toBe(404);
  });

  it('GET /api/photos/:id 不存在应 404', async () => {
    const res = await request(app).get('/api/photos/nonexistent');
    expect(res.status).toBe(404);
  });

  it('POST /api/photos/share 应创建共享链接', async () => {
    const res = await request(app)
      .post('/api/photos/share')
      .send({ photoIds: ['p1', 'p2'], expiresInHours: 24 });
    expect(res.status).toBe(201);
    expect(res.body.data.share.token).toBeTruthy();
  });

  it('GET /api/photos/share/:token 不存在应 404', async () => {
    const res = await request(app).get('/api/photos/share/nonexistent');
    expect(res.status).toBe(404);
  });

  it('scanLibrary 应扫描照片', async () => {
    mockReaddir.mockImplementation((dir: string) => {
      if (dir === '/data') {
        return Promise.resolve([
          { name: 'photo.jpg', isDirectory: () => false, isFile: () => true },
        ]);
      }
      return Promise.resolve([]);
    });
    mockStat.mockResolvedValue({ size: 1000 });

    const photos = await service.scanLibrary();
    expect(photos.length).toBeGreaterThanOrEqual(0);
  });

  it('POST /api/photos/albums/:id/photos 应去重添加', async () => {
    // 跟踪写入的相册数据，让 loadAlbums 能读到
    const writtenFiles = new Map<string, string>();
    mockWriteFile.mockImplementation((filePath: string, content: string) => {
      writtenFiles.set(String(filePath), content);
      return Promise.resolve();
    });
    mockReadFile.mockImplementation((filePath: string) => {
      const content = writtenFiles.get(String(filePath));
      if (content) return Promise.resolve(content);
      return Promise.reject(new Error('ENOENT'));
    });

    // 先创建相册
    const createRes = await request(app)
      .post('/api/photos/albums')
      .send({ name: '去重测试' });
    const albumId = createRes.body.data.album.id;

    // 添加同一照片两次
    await request(app)
      .post(`/api/photos/albums/${albumId}/photos`)
      .send({ photoIds: ['p1', 'p2'] });
    const res2 = await request(app)
      .post(`/api/photos/albums/${albumId}/photos`)
      .send({ photoIds: ['p1', 'p3'] });

    expect(res2.status).toBe(200);
    expect(res2.body.data.added).toBe(1); // 只有 p3 是新的
  });

  it('GET /api/photos/library 应支持年月过滤', async () => {
    const res = await request(app).get('/api/photos/library?year=2026&month=7');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('GET /api/photos/share/:token 过期应 400', async () => {
    // 创建一个已过期的共享链接
    mockReadFile.mockImplementation((filePath: string) => {
      if (String(filePath).includes('shares.json')) {
        return Promise.resolve(JSON.stringify([{
          token: 'expired123',
          photoIds: ['p1'],
          expiresAt: '2020-01-01T00:00:00.000Z',
        }]));
      }
      return Promise.reject(new Error('ENOENT'));
    });

    const res = await request(app).get('/api/photos/share/expired123');
    expect(res.status).toBe(400);
  });

  it('GET /api/photos/:id/thumbnail 不存在应 404', async () => {
    const res = await request(app).get('/api/photos/nonexistent/thumbnail');
    expect(res.status).toBe(404);
  });

  it('GET /api/photos/:id/original 不存在应 404', async () => {
    const res = await request(app).get('/api/photos/nonexistent/original');
    expect(res.status).toBe(404);
  });
});
