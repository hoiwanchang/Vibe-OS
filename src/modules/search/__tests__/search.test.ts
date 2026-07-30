/**
 * 模块：全文搜索 — 集成测试
 * 使用真实文件系统 + 真实 better-sqlite3 FTS5，经 createApp + supertest 验证 HTTP 端点
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 必须在 import 业务模块前注入临时数据根
const TEST_ROOT = `/tmp/search-test-${Date.now()}`;
vi.stubEnv('VIBEOS_DATA_ROOT', TEST_ROOT);
vi.stubEnv('VIBEOS_AUTH_DISABLED', 'true');

const { createApp } = await import('../../../app.js');
const service = await import('../search.service.js');
const dao = await import('../search.dao.js');
const { AppError } = await import('../../../common/app-error.js');

const UID = 1000;
const app = createApp();

/** 在用户目录写入测试文件 */
function setupFiles(): void {
  const root = path.join(TEST_ROOT, String(UID));
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.mkdirSync(path.join(root, '.trash'), { recursive: true });

  fs.writeFileSync(path.join(root, 'notes/hello.txt'), 'the quick brown fox jumps over the lazy dog hello');
  fs.writeFileSync(path.join(root, 'notes/world.md'), '# Title\nhello world markdown document');
  fs.writeFileSync(path.join(root, 'data.json'), '{"greeting":"hello json data"}');
  fs.writeFileSync(path.join(root, 'docs/中文.txt'), '中文 文档 测试 内容');

  // 大文件：>1MB，needle 在头部，tailmarker 在 1MB 之后
  const head = 'needle unique-head-kw\n';
  const pad = 'a'.repeat(1024 * 1024);
  const tail = '\ntailmarker unique-tail-kw';
  fs.writeFileSync(path.join(root, 'big.txt'), head + pad + tail);

  // 应被跳过的目录
  fs.writeFileSync(path.join(root, 'node_modules/skip.txt'), 'zzzskip keyword');
  fs.writeFileSync(path.join(root, '.trash/trash.txt'), 'yyytrash keyword');

  // 非文本类型：内容不应被索引（仅文件名）
  fs.writeFileSync(path.join(root, 'binary.bin'), Buffer.from('hello binary secret content'));

  // 设置 hello.txt 的 mtime 到 2020 年，用于时间范围测试
  fs.utimesSync(path.join(root, 'notes/hello.txt'), new Date('2020-05-01'), new Date('2020-05-01'));
}

beforeAll(() => {
  setupFiles();
  service.reindex(UID);
});

afterAll(() => {
  dao.closeDb();
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('全文搜索模块', () => {
  describe('GET /api/search', () => {
    it('正常搜索应命中并返回 snippet', async () => {
      const res = await request(app).get('/api/search').query({ uid: UID, q: 'hello' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(3);
      const filenames = res.body.data.results.map((r: { filename: string }) => r.filename);
      expect(filenames).toContain('hello.txt');
      expect(res.body.data.results[0].snippet).toBeDefined();
    });

    it('AND 查询应同时满足两个词', async () => {
      const res = await request(app).get('/api/search').query({ uid: UID, q: 'hello markdown' });
      expect(res.status).toBe(200);
      const filenames = res.body.data.results.map((r: { filename: string }) => r.filename);
      expect(filenames).toEqual(['world.md']);
    });

    it('OR 查询应命中任一词', async () => {
      const res = await request(app).get('/api/search').query({ uid: UID, q: 'markdown OR json' });
      expect(res.status).toBe(200);
      const filenames = res.body.data.results.map((r: { filename: string }) => r.filename).sort();
      expect(filenames).toEqual(['data.json', 'world.md']);
    });

    it('引号短语查询应精确匹配相邻词序', async () => {
      const hit = await request(app).get('/api/search').query({ uid: UID, q: '"hello world"' });
      expect(hit.body.data.total).toBeGreaterThanOrEqual(1);
      const miss = await request(app).get('/api/search').query({ uid: UID, q: '"world hello"' });
      expect(miss.body.data.total).toBe(0);
    });

    it('type 过滤应按扩展名筛选', async () => {
      const res = await request(app).get('/api/search').query({ uid: UID, q: 'hello', type: 'md' });
      expect(res.status).toBe(200);
      const filenames = res.body.data.results.map((r: { filename: string }) => r.filename);
      expect(filenames).toEqual(['world.md']);
    });

    it('path 前缀过滤应限定目录', async () => {
      const res = await request(app).get('/api/search').query({ uid: UID, q: 'hello', path: 'notes' });
      expect(res.status).toBe(200);
      const filenames = res.body.data.results.map((r: { filename: string }) => r.filename).sort();
      expect(filenames).toEqual(['hello.txt', 'world.md']);
    });

    it('type=json 过滤应命中 json 文件', async () => {
      const res = await request(app).get('/api/search').query({ uid: UID, q: 'hello', type: 'json' });
      const filenames = res.body.data.results.map((r: { filename: string }) => r.filename);
      expect(filenames).toEqual(['data.json']);
    });

    it('时间范围过滤应按 mtime 筛选', async () => {
      const res = await request(app)
        .get('/api/search')
        .query({ uid: UID, q: 'hello', from: '2020-01-01', to: '2020-12-31' });
      expect(res.status).toBe(200);
      const filenames = res.body.data.results.map((r: { filename: string }) => r.filename);
      expect(filenames).toEqual(['hello.txt']);
    });

    it('分页应正确切分结果', async () => {
      const page1 = await request(app).get('/api/search').query({ uid: UID, q: 'hello', size: 2, page: 1 });
      expect(page1.body.data.results).toHaveLength(2);
      expect(page1.body.data.total).toBeGreaterThanOrEqual(3);
      const page2 = await request(app).get('/api/search').query({ uid: UID, q: 'hello', size: 2, page: 2 });
      expect(page2.body.data.results.length).toBeGreaterThanOrEqual(1);
      expect(page2.body.data.page).toBe(2);
    });

    it('空查询应返回 400', async () => {
      const res = await request(app).get('/api/search').query({ uid: UID, q: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('不存在的 uid 应返回空结果', async () => {
      const res = await request(app).get('/api/search').query({ uid: 9999, q: 'hello' });
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(0);
      expect(res.body.data.results).toEqual([]);
    });

    it('中文分词应基本可用', async () => {
      const res = await request(app).get('/api/search').query({ uid: UID, q: '中文' });
      expect(res.status).toBe(200);
      const filenames = res.body.data.results.map((r: { filename: string }) => r.filename);
      expect(filenames).toContain('中文.txt');
    });

    it('大文件应截断索引（头部命中、尾部不命中）', async () => {
      const head = await request(app).get('/api/search').query({ uid: UID, q: 'needle' });
      expect(head.body.data.total).toBeGreaterThanOrEqual(1);
      const tail = await request(app).get('/api/search').query({ uid: UID, q: 'tailmarker' });
      expect(tail.body.data.total).toBe(0);
    });

    it('应跳过 node_modules 与 .trash 目录', async () => {
      const nm = await request(app).get('/api/search').query({ uid: UID, q: 'zzzskip' });
      expect(nm.body.data.total).toBe(0);
      const trash = await request(app).get('/api/search').query({ uid: UID, q: 'yyytrash' });
      expect(trash.body.data.total).toBe(0);
    });

    it('非文本文件内容不应被索引', async () => {
      const res = await request(app).get('/api/search').query({ uid: UID, q: 'secret' });
      expect(res.body.data.total).toBe(0);
    });
  });

  describe('GET /api/search/status', () => {
    it('应返回索引计数与字节数', async () => {
      const res = await request(app).get('/api/search/status').query({ uid: UID });
      expect(res.status).toBe(200);
      expect(res.body.data.indexedFiles).toBeGreaterThanOrEqual(5);
      expect(res.body.data.totalBytes).toBeGreaterThan(0);
      expect(res.body.data.lastIndexed).toBeTruthy();
    });

    it('未索引用户应返回零计数', async () => {
      const res = await request(app).get('/api/search/status').query({ uid: 8888 });
      expect(res.body.data.indexedFiles).toBe(0);
      expect(res.body.data.totalBytes).toBe(0);
      expect(res.body.data.lastIndexed).toBeNull();
    });
  });

  describe('POST /api/search/reindex', () => {
    it('应全量重建并返回计数与耗时', async () => {
      const res = await request(app).post('/api/search/reindex').send({ uid: UID });
      expect(res.status).toBe(200);
      expect(res.body.data.indexed).toBeGreaterThanOrEqual(5);
      expect(res.body.data.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('reindex 应幂等（计数不变）', async () => {
      const first = await request(app).post('/api/search/reindex').send({ uid: UID });
      const second = await request(app).post('/api/search/reindex').send({ uid: UID });
      expect(second.body.data.indexed).toBe(first.body.data.indexed);
      const status = await request(app).get('/api/search/status').query({ uid: UID });
      expect(status.body.data.indexedFiles).toBe(first.body.data.indexed);
    });

    it('不存在的 uid 应返回 404', async () => {
      const res = await request(app).post('/api/search/reindex').send({ uid: 9999 });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('缺少 uid 应返回 400（zod 校验）', async () => {
      const res = await request(app).post('/api/search/reindex').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('service 路径穿越防护', () => {
    it('indexFile 穿越路径应抛出 403', () => {
      expect(() => service.indexFile(UID, '/etc/passwd', '../../etc/passwd')).toThrow(AppError);
    });

    it('removeFromIndex 应可安全调用', () => {
      expect(() => service.removeFromIndex(UID, 'notes/hello.txt')).not.toThrow();
      // 恢复索引
      service.reindex(UID);
    });
  });
});
