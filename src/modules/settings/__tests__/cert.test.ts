/**
 * 模块：系统设置中心 — TLS 证书 API 端点测试
 * 使用真实 openssl + 临时 VIBEOS_DATA_ROOT（隔离），不 mock child_process
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';

let tmpRoot: string;
let app: Express;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'vibeos-cert-api-'));
  // 必须在动态 import config/app 之前设置，隔离数据根
  process.env['VIBEOS_DATA_ROOT'] = tmpRoot;
  const { createApp } = await import('../../../app.js');
  app = createApp();
});

afterAll(async () => {
  delete process.env['VIBEOS_DATA_ROOT'];
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('GET /api/settings/cert', () => {
  it('初始无证书返回 installed=false', async () => {
    const res = await request(app).get('/api/settings/cert');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.installed).toBe(false);
    expect(res.body.data.info).toBeNull();
  });
});

describe('POST /api/settings/cert/generate', () => {
  it('生成自签证书并返回解析信息', async () => {
    const res = await request(app)
      .post('/api/settings/cert/generate')
      .send({
        commonName: 'nas.tailnet.ts.net',
        sans: ['nas.tailnet.ts.net', '100.64.252.114'],
        days: 365,
        keySize: 2048,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.subject).toContain('nas.tailnet.ts.net');
    expect(res.body.data.isSelfSigned).toBe(true);
    expect(res.body.data.sans).toContain('100.64.252.114');

    // 生成后状态变为已安装
    const status = await request(app).get('/api/settings/cert');
    expect(status.body.data.installed).toBe(true);
    expect(status.body.data.info.isExpired).toBe(false);
  });

  it('非法 keySize 返回 400', async () => {
    const res = await request(app)
      .post('/api/settings/cert/generate')
      .send({ commonName: 'x', sans: [], days: 30, keySize: 1024 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/settings/cert/import', () => {
  it('缺少字段返回 400', async () => {
    const res = await request(app)
      .post('/api/settings/cert/import')
      .send({ certPem: 'x' });
    expect(res.status).toBe(400);
  });

  it('非法证书 PEM 返回 400 INVALID_CERT', async () => {
    const res = await request(app)
      .post('/api/settings/cert/import')
      .send({ certPem: 'garbage', keyPem: 'garbage' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CERT');
  });

  it('私钥与证书不匹配返回 400 KEY_CERT_MISMATCH', async () => {
    // 先生成一对合法证书
    await request(app)
      .post('/api/settings/cert/generate')
      .send({ commonName: 'm.test', sans: ['m.test'], days: 30, keySize: 2048 });
    const { readFile } = await import('node:fs/promises');
    const certPem = await readFile(
      join(tmpRoot, 'vibeos', 'certs', 'server.crt'),
      'utf-8',
    );
    // 不匹配的私钥
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const res = await request(app)
      .post('/api/settings/cert/import')
      .send({ certPem, keyPem: privateKey });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('KEY_CERT_MISMATCH');
  });
});

describe('DELETE /api/settings/cert', () => {
  it('删除后状态回到未安装', async () => {
    // 确保有证书
    await request(app)
      .post('/api/settings/cert/generate')
      .send({ commonName: 'd.test', sans: ['d.test'], days: 30, keySize: 2048 });

    const del = await request(app).delete('/api/settings/cert');
    expect(del.status).toBe(200);
    expect(del.body.data.removed).toBe(true);

    const status = await request(app).get('/api/settings/cert');
    expect(status.body.data.installed).toBe(false);
  });
});
