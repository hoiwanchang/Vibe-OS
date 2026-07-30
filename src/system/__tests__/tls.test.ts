/**
 * 系统层：TLS 证书管理 — 单元测试
 * 使用真实 openssl + 临时目录（VIBEOS_DATA_ROOT 隔离）
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

let tmpRoot: string;
let certPath: string;
let keyPath: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'vibeos-tls-'));
  certPath = join(tmpRoot, 'vibeos', 'certs', 'server.crt');
  keyPath = join(tmpRoot, 'vibeos', 'certs', 'server.key');
  // 隔离数据根，必须在动态 import config 之前设置
  vi.stubEnv('VIBEOS_DATA_ROOT', tmpRoot);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(tmpRoot, { recursive: true, force: true });
});

describe('tls.parseCertPem / generateSelfSignedCert', () => {
  it('生成自签证书并可解析', async () => {
    const { generateSelfSignedCert, parseCertPem } = await import('../tls.js');
    const info = await generateSelfSignedCert({
      certPath,
      keyPath,
      commonName: 'nas.tail1234.ts.net',
      sans: ['nas.tail1234.ts.net', '100.64.0.1'],
      days: 365,
      keySize: 2048,
    });

    expect(info.subject).toContain('nas.tail1234.ts.net');
    expect(info.isSelfSigned).toBe(true);
    expect(info.isExpired).toBe(false);
    expect(info.daysRemaining).toBeGreaterThan(300);
    expect(info.sans).toContain('nas.tail1234.ts.net');
    expect(info.sans).toContain('100.64.0.1');
    expect(info.fingerprint).toMatch(/^([0-9A-F]{2}:)+[0-9A-F]{2}$/);

    // 文件确实写入
    const pem = await readFile(certPath, 'utf-8');
    expect(pem).toContain('BEGIN CERTIFICATE');
    const reparsed = parseCertPem(pem);
    expect(reparsed.serialNumber).toBe(info.serialNumber);
  });

  it('私钥权限为 0600', async () => {
    const { stat } = await import('node:fs/promises');
    const s = await stat(keyPath);
    expect(s.mode & 0o777).toBe(0o600);
  });

  it('非法 PEM 抛出 INVALID_CERT', async () => {
    const { parseCertPem } = await import('../tls.js');
    expect(() => parseCertPem('not a pem')).toThrow(/证书 PEM 解析失败/);
  });
});

describe('tls.getCertStatus', () => {
  it('已安装证书返回 installed=true + info', async () => {
    const { getCertStatus } = await import('../tls.js');
    const status = await getCertStatus(certPath, keyPath);
    expect(status.installed).toBe(true);
    expect(status.info).not.toBeNull();
    expect(status.info?.isSelfSigned).toBe(true);
  });

  it('文件不存在返回 installed=false', async () => {
    const { getCertStatus } = await import('../tls.js');
    const status = await getCertStatus(
      join(tmpRoot, 'nope.crt'),
      join(tmpRoot, 'nope.key'),
    );
    expect(status.installed).toBe(false);
    expect(status.info).toBeNull();
  });

  it('文件存在但内容损坏返回 installed=true + error', async () => {
    const { writeFile } = await import('node:fs/promises');
    const { getCertStatus } = await import('../tls.js');
    const badCert = join(tmpRoot, 'bad.crt');
    const badKey = join(tmpRoot, 'bad.key');
    await writeFile(badCert, 'corrupt pem content', 'utf-8');
    await writeFile(badKey, 'corrupt', 'utf-8');
    const status = await getCertStatus(badCert, badKey);
    expect(status.installed).toBe(true);
    expect(status.info).toBeNull();
    expect(status.error).toBeTruthy();
  });
});

describe('tls.generateSelfSignedCert 边界', () => {
  it('CN 为空时回退到 sans[0]，默认 days/keySize', async () => {
    const { generateSelfSignedCert } = await import('../tls.js');
    const info = await generateSelfSignedCert({
      certPath,
      keyPath,
      commonName: '',
      sans: ['fallback.test'],
      days: 0, // 触发默认 825
      keySize: 2048,
    });
    expect(info.subject).toContain('fallback.test');
    expect(info.daysRemaining).toBeGreaterThan(800);
  });

  it('CN 已在 SAN 列表中时不重复添加', async () => {
    const { generateSelfSignedCert } = await import('../tls.js');
    const info = await generateSelfSignedCert({
      certPath,
      keyPath,
      commonName: 'dup.test',
      sans: ['dup.test', '100.64.0.9'],
      days: 30,
      keySize: 2048,
    });
    // dup.test 只出现一次
    const count = info.sans.filter((s) => s === 'dup.test').length;
    expect(count).toBe(1);
    expect(info.sans).toContain('100.64.0.9');
  });

  it('支持 IPv6 SAN 与 4096 密钥', async () => {
    const { generateSelfSignedCert } = await import('../tls.js');
    const info = await generateSelfSignedCert({
      certPath,
      keyPath,
      commonName: 'v6.test',
      sans: ['v6.test', 'fd7a:115c:a1e0::1'],
      days: 30,
      keySize: 4096,
    });
    // OpenSSL 将 IPv6 规范化为展开大写形式，解析后应保留完整地址（含冒号）
    const v6 = info.sans.find((s) => s.toUpperCase().startsWith('FD7A:115C'));
    expect(v6).toBeTruthy();
    expect(v6).toContain(':');
    expect(info.subject).toContain('v6.test');
  });
});

describe('tls.importCert', () => {
  it('导入匹配的证书+私钥成功', async () => {
    const { generateSelfSignedCert, importCert } = await import('../tls.js');
    // 先生成一对作为合法 PEM 来源
    await generateSelfSignedCert({
      certPath,
      keyPath,
      commonName: 'import.test',
      sans: ['import.test'],
      days: 30,
      keySize: 2048,
    });
    const certPem = await readFile(certPath, 'utf-8');
    const keyPem = await readFile(keyPath, 'utf-8');

    const info = await importCert({
      certPath: join(tmpRoot, 'imp.crt'),
      keyPath: join(tmpRoot, 'imp.key'),
      certPem,
      keyPem,
    });
    expect(info.subject).toContain('import.test');
  });

  it('私钥与证书不匹配抛出 KEY_CERT_MISMATCH', async () => {
    const { generateSelfSignedCert, importCert } = await import('../tls.js');
    await generateSelfSignedCert({
      certPath,
      keyPath,
      commonName: 'a.test',
      sans: ['a.test'],
      days: 30,
      keySize: 2048,
    });
    const certPem = await readFile(certPath, 'utf-8');
    // 生成一个不匹配的私钥
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    await expect(
      importCert({
        certPath: join(tmpRoot, 'mm.crt'),
        keyPath: join(tmpRoot, 'mm.key'),
        certPem,
        keyPem: privateKey,
      }),
    ).rejects.toThrow(/不匹配/);
  });

  it('非法私钥抛出 INVALID_KEY', async () => {
    const { generateSelfSignedCert, importCert } = await import('../tls.js');
    await generateSelfSignedCert({
      certPath,
      keyPath,
      commonName: 'b.test',
      sans: ['b.test'],
      days: 30,
      keySize: 2048,
    });
    const certPem = await readFile(certPath, 'utf-8');
    await expect(
      importCert({
        certPath: join(tmpRoot, 'ik.crt'),
        keyPath: join(tmpRoot, 'ik.key'),
        certPem,
        keyPem: 'garbage',
      }),
    ).rejects.toThrow(/私钥 PEM 解析失败/);
  });
});

describe('tls.removeCert', () => {
  it('删除已存在文件', async () => {
    const { generateSelfSignedCert, removeCert, getCertStatus } = await import(
      '../tls.js'
    );
    await generateSelfSignedCert({
      certPath,
      keyPath,
      commonName: 'del.test',
      sans: ['del.test'],
      days: 30,
      keySize: 2048,
    });
    const result = await removeCert(certPath, keyPath);
    expect(result.removed).toBe(true);
    const status = await getCertStatus(certPath, keyPath);
    expect(status.installed).toBe(false);
  });
});
