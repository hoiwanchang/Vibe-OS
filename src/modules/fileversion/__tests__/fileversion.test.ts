/**
 * 模块：文件版本控制 — 集成测试
 * 使用真实临时数据目录，覆盖 service 全流程 + HTTP 层（策略/校验）
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// 必须在 config/app/service 求值之前注入临时数据根；vi.hoisted 会被提升到所有 import 之前执行
const { TEST_ROOT } = vi.hoisted(() => {
  const root = `/tmp/fileversion-test-${Date.now()}`;
  process.env['VIBEOS_DATA_ROOT'] = root;
  return { TEST_ROOT: root };
});

import request from 'supertest';
import express from 'express';
import { fileversionRoutes } from '../index.js';
import { errorHandler } from '../../../common/error-handler.js';
import * as service from '../fileversion.service.js';
import { AppError } from '../../../common/app-error.js';

// fileversionRoutes 由主线程负责集成到 app.ts；此处自建最小 app 以独立验证路由层
const app = express();
app.use(express.json());
app.use('/api', fileversionRoutes);
app.use(errorHandler);
const UID = 1000;
const userRoot = path.join(TEST_ROOT, String(UID));

/** 在用户空间写入测试文件 */
async function seedFile(rel: string, content: string): Promise<void> {
  const abs = path.join(userRoot, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf-8');
}

beforeAll(async () => {
  await fs.mkdir(userRoot, { recursive: true });
});

afterAll(async () => {
  await fs.rm(TEST_ROOT, { recursive: true, force: true });
});

describe('文件版本控制', () => {
  describe('saveVersion / listVersions', () => {
    it('正常保存版本并列出历史', async () => {
      await seedFile('docs/a.txt', 'v1 内容');
      const n = await service.saveVersion(UID, 'docs/a.txt');
      expect(n).toBe(1);
      const list = await service.listVersions(UID, 'docs/a.txt');
      expect(list.total).toBe(1);
      expect(list.path).toBe('docs/a.txt');
      expect(list.versions[0]?.version).toBe(1);
      expect(list.versions[0]?.filename).toBe('a.txt');
      expect(list.versions[0]?.size).toBeGreaterThan(0);
    });

    it('版本号递增', async () => {
      await seedFile('docs/b.txt', '第一次');
      await service.saveVersion(UID, 'docs/b.txt');
      await fs.writeFile(path.join(userRoot, 'docs/b.txt'), '第二次', 'utf-8');
      const n2 = await service.saveVersion(UID, 'docs/b.txt');
      expect(n2).toBe(2);
      const list = await service.listVersions(UID, 'docs/b.txt');
      expect(list.total).toBe(2);
    });

    it('源文件不存在抛出 404', async () => {
      await expect(service.saveVersion(UID, 'nope/missing.txt')).rejects.toThrow(AppError);
    });

    it('源路径是目录抛出 400', async () => {
      await fs.mkdir(path.join(userRoot, 'somedir'), { recursive: true });
      await expect(service.saveVersion(UID, 'somedir')).rejects.toThrow('是目录');
    });
  });

  describe('路径穿越防护', () => {
    it('resolveUserPath 拒绝 ../ 穿越', () => {
      expect(() => service.resolveUserPath(UID, '../../etc/passwd')).toThrow(AppError);
    });

    it('resolveUserPath 拒绝绝对路径穿越', () => {
      expect(() => service.resolveUserPath(UID, '/etc/shadow')).toThrow(AppError);
    });

    it('listVersions 拒绝穿越路径', async () => {
      await expect(service.listVersions(UID, '../2000/x')).rejects.toThrow(AppError);
    });
  });

  describe('策略模式', () => {
    it('off 模式不保存版本', async () => {
      await service.setPolicy('share-off', { mode: 'off' });
      await seedFile('off.txt', '内容');
      const n = await service.saveVersion(UID, 'off.txt', 'share-off');
      expect(n).toBeNull();
      const list = await service.listVersions(UID, 'off.txt');
      expect(list.total).toBe(0);
    });

    it('simple 模式仅保留 1 版', async () => {
      await service.setPolicy('share-simple', { mode: 'simple' });
      await seedFile('simple.txt', '一');
      await service.saveVersion(UID, 'simple.txt', 'share-simple');
      await fs.writeFile(path.join(userRoot, 'simple.txt'), '二', 'utf-8');
      await service.saveVersion(UID, 'simple.txt', 'share-simple');
      const list = await service.listVersions(UID, 'simple.txt');
      expect(list.total).toBe(1);
      expect(list.versions[0]?.version).toBe(2);
    });

    it('multiversion 裁剪到 maxVersions', async () => {
      await service.setPolicy('share-multi', { mode: 'multiversion', maxVersions: 2 });
      await seedFile('multi.txt', 'c1');
      for (let i = 0; i < 4; i++) {
        await fs.writeFile(path.join(userRoot, 'multi.txt'), `c${i}`, 'utf-8');
        await service.saveVersion(UID, 'multi.txt', 'share-multi');
      }
      const list = await service.listVersions(UID, 'multi.txt');
      expect(list.total).toBe(2);
      expect(list.versions.map((v) => v.version)).toEqual([3, 4]);
    });

    it('pruneVersions 按 maxDays 清理过期版本', async () => {
      await seedFile('days.txt', 'x');
      await service.saveVersion(UID, 'days.txt');
      const policy = await service.getPolicy('default');
      // 负天数 → 所有版本立即过期
      const kept = await service.pruneVersions(UID, 'days.txt', { ...policy, maxDays: -1 });
      expect(kept).toHaveLength(0);
      const list = await service.listVersions(UID, 'days.txt');
      expect(list.total).toBe(0);
    });
  });

  describe('restoreVersion', () => {
    it('恢复指定版本到原路径', async () => {
      await seedFile('r.txt', '原始内容');
      await service.saveVersion(UID, 'r.txt');
      await fs.writeFile(path.join(userRoot, 'r.txt'), '被改坏', 'utf-8');
      const result = await service.restoreVersion(UID, 'r.txt', 1);
      expect(result.version).toBe(1);
      expect(result.restored).toBe('r.txt');
      expect(result.size).toBeGreaterThan(0);
      const content = await fs.readFile(path.join(userRoot, 'r.txt'), 'utf-8');
      expect(content).toBe('原始内容');
    });

    it('恢复不存在的版本抛出 404', async () => {
      await seedFile('r2.txt', 'x');
      await service.saveVersion(UID, 'r2.txt');
      await expect(service.restoreVersion(UID, 'r2.txt', 99)).rejects.toThrow(AppError);
    });
  });

  describe('deleteVersion', () => {
    it('删除指定版本', async () => {
      await seedFile('d.txt', '一');
      await service.saveVersion(UID, 'd.txt');
      await fs.writeFile(path.join(userRoot, 'd.txt'), '二', 'utf-8');
      await service.saveVersion(UID, 'd.txt');
      const result = await service.deleteVersion(UID, 'd.txt', 1);
      expect(result.deleted).toBe('d.txt');
      expect(result.version).toBe(1);
      const list = await service.listVersions(UID, 'd.txt');
      expect(list.total).toBe(1);
      expect(list.versions[0]?.version).toBe(2);
    });

    it('删除不存在的版本抛出 404', async () => {
      await seedFile('d2.txt', 'x');
      await expect(service.deleteVersion(UID, 'd2.txt', 5)).rejects.toThrow(AppError);
    });
  });

  describe('getVersionFile', () => {
    it('返回存在的版本文件路径', async () => {
      await seedFile('vf.txt', '快照内容');
      await service.saveVersion(UID, 'vf.txt');
      const info = await service.getVersionFile(UID, 'vf.txt', 1);
      expect(info.filename).toBe('vf.txt');
      const content = await fs.readFile(info.absPath, 'utf-8');
      expect(content).toBe('快照内容');
    });

    it('版本不存在抛出 404', async () => {
      await seedFile('vf2.txt', 'x');
      await expect(service.getVersionFile(UID, 'vf2.txt', 42)).rejects.toThrow(AppError);
    });
  });

  describe('策略 HTTP API', () => {
    it('GET policy 返回默认策略', async () => {
      const res = await request(app).get('/api/files/versions/policy?share=brand-new');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('multiversion');
      expect(res.body.data.maxVersions).toBe(32);
      expect(res.body.data.maxDays).toBe(30);
    });

    it('PUT policy 更新并持久化', async () => {
      const put = await request(app)
        .put('/api/files/versions/policy')
        .send({ share: 'http-share', mode: 'simple', maxVersions: 5 });
      expect(put.status).toBe(200);
      expect(put.body.data.mode).toBe('simple');
      expect(put.body.data.maxVersions).toBe(5);

      const get = await request(app).get('/api/files/versions/policy?share=http-share');
      expect(get.body.data.mode).toBe('simple');
      expect(get.body.data.maxVersions).toBe(5);
    });

    it('PUT policy 缺少 share 返回 400', async () => {
      const res = await request(app).put('/api/files/versions/policy').send({ mode: 'off' });
      expect(res.status).toBe(400);
    });

    it('PUT policy 非法 mode 返回 400', async () => {
      const res = await request(app)
        .put('/api/files/versions/policy')
        .send({ share: 's', mode: 'bogus' });
      expect(res.status).toBe(400);
    });
  });

  describe('版本 HTTP API 参数校验', () => {
    it('restore 缺少字段返回 400', async () => {
      const res = await request(app).post('/api/files/versions/restore').send({ uid: UID });
      expect(res.status).toBe(400);
    });

    it('restore 非法 version 返回 400', async () => {
      const res = await request(app)
        .post('/api/files/versions/restore')
        .send({ uid: UID, path: 'x.txt', version: 0 });
      expect(res.status).toBe(400);
    });

    it('restore 正常恢复版本', async () => {
      await seedFile('rs.txt', '原始');
      await service.saveVersion(UID, 'rs.txt');
      await fs.writeFile(path.join(userRoot, 'rs.txt'), '改坏', 'utf-8');
      const res = await request(app)
        .post('/api/files/versions/restore')
        .send({ uid: UID, path: 'rs.txt', version: 1 });
      expect(res.status).toBe(200);
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.restored).toBe('rs.txt');
    });

    it('list 缺少 uid 返回 400', async () => {
      const res = await request(app).get('/api/files/versions?path=x.txt');
      expect(res.status).toBe(400);
    });

    it('download 缺少 version 返回 400', async () => {
      const res = await request(app).get(`/api/files/versions/download?uid=${UID}&path=x.txt`);
      expect(res.status).toBe(400);
    });

    it('download 正常返回版本文件内容', async () => {
      await seedFile('dl.txt', '下载内容');
      await service.saveVersion(UID, 'dl.txt');
      const res = await request(app).get(
        `/api/files/versions/download?uid=${UID}&path=dl.txt&version=1`,
      );
      expect(res.status).toBe(200);
      expect(res.text).toBe('下载内容');
    });

    it('delete 正常删除版本', async () => {
      await seedFile('del.txt', '一');
      await service.saveVersion(UID, 'del.txt');
      const res = await request(app).delete(
        `/api/files/versions?uid=${UID}&path=del.txt&version=1`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe('del.txt');
      expect(res.body.data.version).toBe(1);
    });

    it('delete 缺少 version 返回 400', async () => {
      const res = await request(app).delete(`/api/files/versions?uid=${UID}&path=x.txt`);
      expect(res.status).toBe(400);
    });
  });
});
