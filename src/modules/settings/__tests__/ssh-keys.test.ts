/**
 * 模块：系统设置中心 — SSH 密钥管理 API 端点测试
 * 使用真实 ssh-keygen + 临时 authorized_keys 文件（隔离），不 mock child_process
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import {
  generateKeyPair,
  importPublicKey,
  removePublicKey,
  listAuthorizedKeys,
} from '../../../system/ssh-keys.js';

let tmpRoot: string;
let keysFile: string;
let app: Express;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'vibeos-sshkey-api-'));
  keysFile = join(tmpRoot, 'authorized_keys');
  // 必须在动态 import config/app 之前设置，隔离数据根与 authorized_keys 路径
  process.env['VIBEOS_DATA_ROOT'] = tmpRoot;
  process.env['VIBEOS_SSH_AUTHORIZED_KEYS_FILE'] = keysFile;
  const { createApp } = await import('../../../app.js');
  app = createApp();
});

afterAll(async () => {
  delete process.env['VIBEOS_DATA_ROOT'];
  delete process.env['VIBEOS_SSH_AUTHORIZED_KEYS_FILE'];
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('GET /api/settings/ssh/keys', () => {
  it('初始无公钥返回空列表', async () => {
    const res = await request(app).get('/api/settings/ssh/keys');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.keys).toEqual([]);
    expect(res.body.data.keysFile).toBe(keysFile);
  });
});

describe('POST /api/settings/ssh/keys/generate', () => {
  it('生成 ed25519 密钥对并返回公钥+私钥+指纹', async () => {
    const res = await request(app)
      .post('/api/settings/ssh/keys/generate')
      .send({ type: 'ed25519', comment: 'test@vibeos' });
    expect(res.status).toBe(200);
    expect(res.body.data.publicKey).toContain('ssh-ed25519');
    expect(res.body.data.publicKey).toContain('test@vibeos');
    expect(res.body.data.privateKey).toContain('PRIVATE KEY');
    expect(res.body.data.fingerprint).toMatch(/^SHA256:/);
    expect(res.body.data.type).toBe('ED25519');
  });

  it('生成后公钥自动加入授权列表', async () => {
    const gen = await request(app)
      .post('/api/settings/ssh/keys/generate')
      .send({ type: 'ed25519', comment: 'auto-import@vibeos' });
    const fingerprint = gen.body.data.fingerprint as string;

    const list = await request(app).get('/api/settings/ssh/keys');
    const found = list.body.data.keys.some(
      (k: { fingerprint: string }) => k.fingerprint === fingerprint,
    );
    expect(found).toBe(true);
  });

  it('生成 RSA 4096 密钥对', async () => {
    const res = await request(app)
      .post('/api/settings/ssh/keys/generate')
      .send({ type: 'rsa', bits: 4096 });
    expect(res.status).toBe(200);
    expect(res.body.data.publicKey).toContain('ssh-rsa');
    expect(res.body.data.type).toBe('RSA');
  });

  it('非法 type 返回 400', async () => {
    const res = await request(app)
      .post('/api/settings/ssh/keys/generate')
      .send({ type: 'dsa' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/settings/ssh/keys (import)', () => {
  it('导入合法公钥成功并可列举', async () => {
    // 用系统层直接生成未导入的密钥对
    const key = await generateKeyPair({ type: 'ed25519', comment: 'import-test@vibeos' });

    const res = await request(app)
      .post('/api/settings/ssh/keys')
      .send({ publicKey: key.publicKey });
    expect(res.status).toBe(200);
    expect(res.body.data.fingerprint).toMatch(/^SHA256:/);
    expect(res.body.data.valid).toBe(true);

    // 列举应包含该公钥
    const list = await request(app).get('/api/settings/ssh/keys');
    const found = list.body.data.keys.find(
      (k: { fingerprint: string }) => k.fingerprint === res.body.data.fingerprint,
    );
    expect(found).toBeDefined();
  });

  it('缺少 publicKey 返回 400', async () => {
    const res = await request(app).post('/api/settings/ssh/keys').send({});
    expect(res.status).toBe(400);
  });

  it('非法公钥返回 400 INVALID_KEY', async () => {
    const res = await request(app)
      .post('/api/settings/ssh/keys')
      .send({ publicKey: 'not-a-valid-key' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_KEY');
  });

  it('重复导入返回 409 CONFLICT', async () => {
    const key = await generateKeyPair({ type: 'ed25519', comment: 'dup-test@vibeos' });

    const first = await request(app)
      .post('/api/settings/ssh/keys')
      .send({ publicKey: key.publicKey });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/settings/ssh/keys')
      .send({ publicKey: key.publicKey });
    expect(second.status).toBe(409);
  });
});

describe('DELETE /api/settings/ssh/keys', () => {
  it('按指纹删除公钥', async () => {
    // 用系统层生成未导入的密钥对，再经 API 导入
    const key = await generateKeyPair({ type: 'ed25519', comment: 'delete-test@vibeos' });
    const imp = await request(app)
      .post('/api/settings/ssh/keys')
      .send({ publicKey: key.publicKey });
    const fingerprint = imp.body.data.fingerprint as string;

    const del = await request(app)
      .delete('/api/settings/ssh/keys')
      .query({ fingerprint });
    expect(del.status).toBe(200);
    expect(del.body.data.removed).toBe(true);

    // 确认已移除
    const list = await request(app).get('/api/settings/ssh/keys');
    const stillThere = list.body.data.keys.some(
      (k: { fingerprint: string }) => k.fingerprint === fingerprint,
    );
    expect(stillThere).toBe(false);
  });

  it('删除不存在的指纹返回 removed=false', async () => {
    const res = await request(app)
      .delete('/api/settings/ssh/keys')
      .query({ fingerprint: 'SHA256:doesnotexist' });
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(false);
  });

  it('缺少 fingerprint 参数返回 400', async () => {
    const res = await request(app).delete('/api/settings/ssh/keys');
    expect(res.status).toBe(400);
  });
});

describe('system/ssh-keys 边界分支', () => {
  it('removePublicKey 对不存在的文件返回 removed=false', async () => {
    const ghost = join(tmpRoot, 'no-such-dir', 'authorized_keys');
    const result = await removePublicKey(ghost, 'SHA256:whatever');
    expect(result.removed).toBe(false);
  });

  it('removePublicKey 空指纹抛 INVALID_PARAM', async () => {
    await expect(removePublicKey(keysFile, '  ')).rejects.toMatchObject({
      code: 'INVALID_PARAM',
    });
  });

  it('importPublicKey 空公钥抛 INVALID_KEY', async () => {
    await expect(importPublicKey(keysFile, '   ')).rejects.toMatchObject({
      code: 'INVALID_KEY',
    });
  });

  it('importPublicKey 追加到无尾换行的文件（needsNewline 分支）', async () => {
    const f = join(tmpRoot, 'no-newline-keys');
    const key = await generateKeyPair({ type: 'ed25519', comment: 'nl@vibeos' });
    // 预置一行无尾换行的合法公钥
    const seed = await generateKeyPair({ type: 'ed25519', comment: 'seed@vibeos' });
    await writeFile(f, seed.publicKey, { mode: 0o600 }); // 无尾换行

    const imported = await importPublicKey(f, key.publicKey);
    expect(imported.valid).toBe(true);

    const list = await listAuthorizedKeys(f);
    expect(list.length).toBe(2);
  });

  it('listAuthorizedKeys 跳过注释行并标记非法行', async () => {
    const f = join(tmpRoot, 'mixed-keys');
    const key = await generateKeyPair({ type: 'ed25519', comment: 'ok@vibeos' });
    await writeFile(
      f,
      `# 这是注释\n${key.publicKey}\nnot-a-valid-key-line\n\n`,
      { mode: 0o600 },
    );

    const list = await listAuthorizedKeys(f);
    // 注释行被跳过，剩 1 合法 + 1 非法
    expect(list.length).toBe(2);
    expect(list.some((k) => k.valid && k.comment === 'ok@vibeos')).toBe(true);
    expect(list.some((k) => !k.valid)).toBe(true);
  });
});
