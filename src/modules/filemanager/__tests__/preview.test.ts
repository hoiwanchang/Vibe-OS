/**
 * 模块：文件管理器 — 预览 / 缩略图集成测试
 * 使用真实 fs + sharp + createApp + supertest，环境隔离到临时目录
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';

// 环境隔离：必须在 import app（其 transitively 冻结 config.ts）之前完成
const TMP_ROOT = `/tmp/preview-test-${Date.now()}`;
vi.stubEnv('VIBEOS_DATA_ROOT', TMP_ROOT);
vi.stubEnv('VIBEOS_AUTH_DISABLED', 'true');

const UID = 1000;
const USER_DIR = path.join(TMP_ROOT, String(UID));

let app: import('express').Express;

beforeAll(async () => {
  // 动态导入，确保上面的 env 已生效
  const mod = await import('../../../app.js');
  app = mod.createApp();

  // 造测试文件
  await fs.mkdir(USER_DIR, { recursive: true });
  await fs.writeFile(path.join(USER_DIR, 'note.txt'), 'hello preview', 'utf-8');
  await fs.writeFile(path.join(USER_DIR, 'doc.md'), '# 标题\n正文内容', 'utf-8');
  await fs.writeFile(path.join(USER_DIR, 'data.bin'), Buffer.from([0x00, 0x01, 0x02, 0xff]));
  // 真实 10x10 红色 PNG
  const redPng = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();
  await fs.writeFile(path.join(USER_DIR, 'red.png'), redPng);
  // SVG
  await fs.writeFile(
    path.join(USER_DIR, 'icon.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>',
    'utf-8',
  );
  // 大文本（>1MB）用于截断测试
  const big = 'x'.repeat(1024 * 1024 + 512);
  await fs.writeFile(path.join(USER_DIR, 'big.txt'), big, 'utf-8');
});

afterAll(async () => {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('文件预览 / 缩略图端点', () => {
  it('txt 预览返回 content 且 truncated=false', async () => {
    const res = await request(app)
      .get('/api/files/preview')
      .query({ uid: UID, path: 'note.txt' });
    expect(res.status).toBe(200);
    expect(res.body.data.kind).toBe('text');
    expect(res.body.data.content).toBe('hello preview');
    expect(res.body.data.truncated).toBe(false);
  });

  it('md 预览 kind=text 且返回内容', async () => {
    const res = await request(app)
      .get('/api/files/preview')
      .query({ uid: UID, path: 'doc.md' });
    expect(res.status).toBe(200);
    expect(res.body.data.kind).toBe('text');
    expect(res.body.data.content).toContain('标题');
  });

  it('.bin 预览返回 unsupported', async () => {
    const res = await request(app)
      .get('/api/files/preview')
      .query({ uid: UID, path: 'data.bin' });
    expect(res.status).toBe(200);
    expect(res.body.data.kind).toBe('unsupported');
    expect(res.body.data.content).toBeUndefined();
  });

  it('图片预览返回 kind=image 且不带 content', async () => {
    const res = await request(app)
      .get('/api/files/preview')
      .query({ uid: UID, path: 'red.png' });
    expect(res.status).toBe(200);
    expect(res.body.data.kind).toBe('image');
    expect(res.body.data.mimeType).toBe('image/png');
    expect(res.body.data.content).toBeUndefined();
  });

  it('大文本预览标记 truncated=true', async () => {
    const res = await request(app)
      .get('/api/files/preview')
      .query({ uid: UID, path: 'big.txt' });
    expect(res.status).toBe(200);
    expect(res.body.data.kind).toBe('text');
    expect(res.body.data.truncated).toBe(true);
    expect(res.body.data.size).toBeGreaterThan(1024 * 1024);
  });

  it('预览不存在文件返回 404', async () => {
    const res = await request(app)
      .get('/api/files/preview')
      .query({ uid: UID, path: 'nope.txt' });
    expect(res.status).toBe(404);
  });

  it('预览路径穿越返回 403', async () => {
    const res = await request(app)
      .get('/api/files/preview')
      .query({ uid: UID, path: '../../etc/passwd' });
    expect(res.status).toBe(403);
  });

  it('缩略图首次生成 cached=false 且返回 PNG', async () => {
    const res = await request(app)
      .get('/api/files/thumbnail')
      .query({ uid: UID, path: 'red.png' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['x-thumbnail-cached']).toBe('false');
    // PNG 魔数
    expect(res.body[0]).toBe(0x89);
    expect(res.body[1]).toBe(0x50);
  });

  it('缩略图第二次请求命中缓存 cached=true', async () => {
    const res = await request(app)
      .get('/api/files/thumbnail')
      .query({ uid: UID, path: 'red.png' });
    expect(res.status).toBe(200);
    expect(res.headers['x-thumbnail-cached']).toBe('true');
  });

  it('svg 转 png 缩略图成功', async () => {
    const res = await request(app)
      .get('/api/files/thumbnail')
      .query({ uid: UID, path: 'icon.svg' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.body[0]).toBe(0x89);
  });

  it('非图片请求缩略图返回 NOT_IMAGE 400', async () => {
    const res = await request(app)
      .get('/api/files/thumbnail')
      .query({ uid: UID, path: 'note.txt' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_IMAGE');
  });

  it('缩略图路径穿越返回 403', async () => {
    const res = await request(app)
      .get('/api/files/thumbnail')
      .query({ uid: UID, path: '../2000/red.png' });
    expect(res.status).toBe(403);
  });

  it('缩略图不存在文件返回 404', async () => {
    const res = await request(app)
      .get('/api/files/thumbnail')
      .query({ uid: UID, path: 'ghost.png' });
    expect(res.status).toBe(404);
  });
});
