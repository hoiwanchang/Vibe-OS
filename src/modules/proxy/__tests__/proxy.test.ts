/**
 * 模块：反向代理管理 — 集成测试
 * mock 系统命令（systemctl）和 TLS 证书生成，使用真实文件系统
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 必须在 import 业务模块前注入临时数据根
const TEST_ROOT = `/tmp/proxy-test-${Date.now()}`;
vi.stubEnv('VIBEOS_DATA_ROOT', TEST_ROOT);
vi.stubEnv('VIBEOS_AUTH_DISABLED', 'true');

// Mock 系统命令
const mockExecuteCommandStrict = vi.fn().mockResolvedValue({
  exitCode: 0,
  stdout: '',
  stderr: '',
});
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommandStrict(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));

// Mock TLS 证书生成（避免真实 openssl 调用）
const mockGenerateSelfSignedCert = vi.fn().mockResolvedValue({
  subject: 'CN=test-proxy',
  issuer: 'CN=test-proxy',
  serialNumber: 'AABBCCDD',
  fingerprint: 'AA:BB:CC:DD',
  validFrom: new Date().toISOString(),
  validTo: new Date(Date.now() + 825 * 86400000).toISOString(),
  daysRemaining: 825,
  isExpired: false,
  isSelfSigned: true,
  sans: ['test-proxy.local'],
});
vi.mock('../../../system/tls.js', () => ({
  getCertStatus: vi.fn().mockResolvedValue({
    installed: false,
    certPath: '',
    keyPath: '',
    info: null,
  }),
  generateSelfSignedCert: (...args: unknown[]) => mockGenerateSelfSignedCert(...args),
  importCert: vi.fn(),
  removeCert: vi.fn(),
  parseCertPem: vi.fn(),
}));

const { createApp } = await import('../../../app.js');
const service = await import('../proxy.service.js');

const app = createApp();

/** 清理规则文件 */
function cleanRules(): void {
  const rulesFile = path.join(TEST_ROOT, 'vibeos', 'settings', 'proxy.json');
  try {
    fs.rmSync(rulesFile, { force: true });
  } catch { /* ignore */ }
}

beforeAll(() => {
  fs.mkdirSync(path.join(TEST_ROOT, 'vibeos', 'settings'), { recursive: true });
  fs.mkdirSync(path.join(TEST_ROOT, 'vibeos', 'proxy', 'vhosts'), { recursive: true });
  fs.mkdirSync(path.join(TEST_ROOT, 'vibeos', 'proxy', 'logs'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  cleanRules();
  vi.clearAllMocks();
  mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
});

/* ========== 规则 CRUD ========== */

describe('代理规则 CRUD', () => {
  it('POST /api/proxy/rules 应创建规则并返回 201', async () => {
    const res = await request(app)
      .post('/api/proxy/rules')
      .send({
        name: '测试服务',
        domain: 'app.local',
        target: '192.168.1.100:8080',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe('测试服务');
    expect(res.body.data.domain).toBe('app.local');
    expect(res.body.data.target).toBe('192.168.1.100:8080');
    expect(res.body.data.path).toBe('/');
    expect(res.body.data.websocket).toBe(false);
    expect(res.body.data.https).toBe(false);
    expect(res.body.data.accessLog).toBe(true);
    expect(res.body.data.enabled).toBe(true);
  });

  it('GET /api/proxy/rules 应返回全部规则', async () => {
    // 先创建两条
    await request(app).post('/api/proxy/rules').send({
      name: 'A', domain: 'a.local', target: '10.0.0.1:80',
    });
    await request(app).post('/api/proxy/rules').send({
      name: 'B', domain: 'b.local', target: '10.0.0.2:80',
    });

    const res = await request(app).get('/api/proxy/rules');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('GET /api/proxy/rules/:id 应返回单条规则', async () => {
    const created = await request(app).post('/api/proxy/rules').send({
      name: '单条', domain: 'single.local', target: '10.0.0.3:3000',
    });
    const id = created.body.data.id;

    const res = await request(app).get(`/api/proxy/rules/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
    expect(res.body.data.name).toBe('单条');
  });

  it('GET /api/proxy/rules/:id 不存在应返回 404', async () => {
    const res = await request(app).get(
      '/api/proxy/rules/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('PUT /api/proxy/rules/:id 应更新规则', async () => {
    const created = await request(app).post('/api/proxy/rules').send({
      name: '原始', domain: 'update.local', target: '10.0.0.4:80',
    });
    const id = created.body.data.id;

    const res = await request(app)
      .put(`/api/proxy/rules/${id}`)
      .send({ name: '已更新', websocket: true, target: '10.0.0.4:9090' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('已更新');
    expect(res.body.data.websocket).toBe(true);
    expect(res.body.data.target).toBe('10.0.0.4:9090');
    expect(res.body.data.domain).toBe('update.local');
  });

  it('PUT /api/proxy/rules/:id 不存在应返回 404', async () => {
    const res = await request(app)
      .put('/api/proxy/rules/00000000-0000-0000-0000-000000000000')
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('DELETE /api/proxy/rules/:id 应删除规则', async () => {
    const created = await request(app).post('/api/proxy/rules').send({
      name: '待删', domain: 'del.local', target: '10.0.0.5:80',
    });
    const id = created.body.data.id;

    const res = await request(app).delete(`/api/proxy/rules/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(id);

    // 确认已删除
    const check = await request(app).get(`/api/proxy/rules/${id}`);
    expect(check.status).toBe(404);
  });

  it('DELETE /api/proxy/rules/:id 不存在应返回 404', async () => {
    const res = await request(app).delete(
      '/api/proxy/rules/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(404);
  });
});

/* ========== 校验 ========== */

describe('参数校验', () => {
  it('缺少 name 应返回 400', async () => {
    const res = await request(app)
      .post('/api/proxy/rules')
      .send({ domain: 'x.local', target: '10.0.0.1:80' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('非法 target 格式应返回 400', async () => {
    const res = await request(app)
      .post('/api/proxy/rules')
      .send({ name: 'x', domain: 'x.local', target: 'not-a-target' });
    expect(res.status).toBe(400);
  });

  it('非法 path（不以 / 开头）应返回 400', async () => {
    const res = await request(app)
      .post('/api/proxy/rules')
      .send({ name: 'x', domain: 'x.local', target: '10.0.0.1:80', path: 'nope' });
    expect(res.status).toBe(400);
  });

  it('域名+路径重复应返回 409', async () => {
    await request(app).post('/api/proxy/rules').send({
      name: 'A', domain: 'dup.local', target: '10.0.0.1:80', path: '/api',
    });
    const res = await request(app).post('/api/proxy/rules').send({
      name: 'B', domain: 'dup.local', target: '10.0.0.2:80', path: '/api',
    });
    expect(res.status).toBe(409);
  });

  it('非法 UUID 路径参数应返回 400', async () => {
    const res = await request(app).get('/api/proxy/rules/not-a-uuid');
    expect(res.status).toBe(400);
  });
});

/* ========== nginx 配置生成 ========== */

describe('nginx 配置生成', () => {
  it('创建启用规则应生成 vhost 配置文件', async () => {
    const created = await request(app).post('/api/proxy/rules').send({
      name: 'vhost-test', domain: 'vhost.local', target: '10.0.0.10:8080',
    });
    const id = created.body.data.id;
    const confPath = path.join(TEST_ROOT, 'vibeos', 'proxy', 'vhosts', `${id}.conf`);
    expect(fs.existsSync(confPath)).toBe(true);

    const content = fs.readFileSync(confPath, 'utf-8');
    expect(content).toContain('server_name vhost.local');
    expect(content).toContain('proxy_pass http://10.0.0.10:8080');
  });

  it('WebSocket 规则配置应包含 upgrade 头', async () => {
    const created = await request(app).post('/api/proxy/rules').send({
      name: 'ws-test', domain: 'ws.local', target: '10.0.0.11:3000',
      websocket: true,
    });
    const id = created.body.data.id;
    const confPath = path.join(TEST_ROOT, 'vibeos', 'proxy', 'vhosts', `${id}.conf`);
    const content = fs.readFileSync(confPath, 'utf-8');
    expect(content).toContain('proxy_http_version 1.1');
    expect(content).toContain('Upgrade $http_upgrade');
    expect(content).toContain('Connection "upgrade"');
  });

  it('HTTPS 规则配置应包含 ssl 指令和 301 重定向', async () => {
    const created = await request(app).post('/api/proxy/rules').send({
      name: 'https-test', domain: 'secure.local', target: '10.0.0.12:443',
      https: true,
    });
    const id = created.body.data.id;
    const confPath = path.join(TEST_ROOT, 'vibeos', 'proxy', 'vhosts', `${id}.conf`);
    const content = fs.readFileSync(confPath, 'utf-8');
    expect(content).toContain('listen 443 ssl');
    expect(content).toContain('ssl_certificate');
    expect(content).toContain('return 301 https://');
  });

  it('禁用规则不应生成配置文件', async () => {
    const created = await request(app).post('/api/proxy/rules').send({
      name: 'disabled', domain: 'off.local', target: '10.0.0.13:80',
      enabled: false,
    });
    const id = created.body.data.id;
    const confPath = path.join(TEST_ROOT, 'vibeos', 'proxy', 'vhosts', `${id}.conf`);
    expect(fs.existsSync(confPath)).toBe(false);
  });

  it('禁用规则后应删除配置文件', async () => {
    const created = await request(app).post('/api/proxy/rules').send({
      name: 'toggle', domain: 'toggle.local', target: '10.0.0.14:80',
    });
    const id = created.body.data.id;
    const confPath = path.join(TEST_ROOT, 'vibeos', 'proxy', 'vhosts', `${id}.conf`);
    expect(fs.existsSync(confPath)).toBe(true);

    await request(app).put(`/api/proxy/rules/${id}`).send({ enabled: false });
    expect(fs.existsSync(confPath)).toBe(false);
  });

  it('访问日志关闭时配置应包含 access_log off', async () => {
    const created = await request(app).post('/api/proxy/rules').send({
      name: 'nolog', domain: 'nolog.local', target: '10.0.0.15:80',
      accessLog: false,
    });
    const id = created.body.data.id;
    const confPath = path.join(TEST_ROOT, 'vibeos', 'proxy', 'vhosts', `${id}.conf`);
    const content = fs.readFileSync(confPath, 'utf-8');
    expect(content).toContain('access_log off');
  });
});

/* ========== nginx 重载 ========== */

describe('POST /api/proxy/reload', () => {
  it('应调用 systemctl reload nginx 并返回成功', async () => {
    await request(app).post('/api/proxy/rules').send({
      name: 'reload-test', domain: 'reload.local', target: '10.0.0.20:80',
    });

    const res = await request(app).post('/api/proxy/reload');
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.configCount).toBeGreaterThanOrEqual(1);
    expect(mockExecuteCommandStrict).toHaveBeenCalledWith(
      'systemctl',
      ['reload', 'nginx'],
    );
  });

  it('systemctl 失败时应返回 success=false', async () => {
    mockExecuteCommandStrict.mockRejectedValueOnce(
      new Error('nginx not running'),
    );

    const res = await request(app).post('/api/proxy/reload');
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(false);
    expect(res.body.data.message).toContain('nginx 重载失败');
  });
});

/* ========== 证书管理 ========== */

describe('证书管理', () => {
  it('GET /api/proxy/certs 应返回证书状态', async () => {
    const res = await request(app).get('/api/proxy/certs');
    expect(res.status).toBe(200);
    expect(res.body.data.installed).toBe(false);
    expect(res.body.data.certPath).toBeDefined();
    expect(res.body.data.keyPath).toBeDefined();
  });

  it('POST /api/proxy/certs 应生成自签证书', async () => {
    const res = await request(app)
      .post('/api/proxy/certs')
      .send({ sans: ['proxy.local', '100.64.0.1'] });
    expect(res.status).toBe(201);
    expect(res.body.data.subject).toContain('test-proxy');
    expect(mockGenerateSelfSignedCert).toHaveBeenCalledOnce();
  });

  it('POST /api/proxy/certs 缺少 sans 应返回 400', async () => {
    const res = await request(app)
      .post('/api/proxy/certs')
      .send({ commonName: 'test' });
    expect(res.status).toBe(400);
  });
});

/* ========== 状态 ========== */

describe('GET /api/proxy/status', () => {
  it('应返回规则统计和证书状态', async () => {
    await request(app).post('/api/proxy/rules').send({
      name: 's1', domain: 's1.local', target: '10.0.0.30:80',
    });
    await request(app).post('/api/proxy/rules').send({
      name: 's2', domain: 's2.local', target: '10.0.0.31:80', enabled: false,
    });

    const res = await request(app).get('/api/proxy/status');
    expect(res.status).toBe(200);
    expect(res.body.data.totalRules).toBe(2);
    expect(res.body.data.enabledRules).toBe(1);
    expect(res.body.data.certInstalled).toBe(false);
    expect(res.body.data.configDir).toContain('proxy/vhosts');
  });
});

/* ========== service 层单元测试 ========== */

describe('service 层', () => {
  it('generateVhostConfig 应生成合法 nginx 配置', () => {
    const rule = {
      id: 'test-id',
      name: 'unit',
      domain: 'unit.local',
      path: '/app',
      target: '127.0.0.1:3000',
      websocket: true,
      https: false,
      accessLog: true,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const config = service.generateVhostConfig(rule);
    expect(config).toContain('server_name unit.local');
    expect(config).toContain('location /app');
    expect(config).toContain('proxy_pass http://127.0.0.1:3000');
    expect(config).toContain('proxy_http_version 1.1');
    expect(config).toContain('access_log');
  });

  it('generateAllConfigs 应只为启用规则生成配置', async () => {
    cleanRules();
    await service.createRule({
      name: 'on', domain: 'on.local', target: '10.0.0.40:80',
    });
    await service.createRule({
      name: 'off', domain: 'off.local', target: '10.0.0.41:80', enabled: false,
    });

    const count = await service.generateAllConfigs();
    expect(count).toBe(1);
  });
});
