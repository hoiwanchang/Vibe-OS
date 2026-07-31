/**
 * 模块：WireGuard VPN — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn().mockResolvedValue(undefined);

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

const mockExecuteCommand = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
}));

vi.mock('../../../system/filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

import { createApp } from '../../../app.js';

const SERVER_CFG = JSON.stringify({
  privateKey: 'server-priv',
  publicKey: 'server-pub',
  port: 51820,
  subnet: '10.8.0.0/24',
  address: '10.8.0.1',
  dns: '10.8.0.1',
  createdAt: '2026-01-01T00:00:00.000Z',
});

const PEER_RECORD = {
  name: 'test-peer',
  publicKey: 'peer-pub-key',
  privateKey: 'peer-priv-key',
  presharedKey: null,
  address: '10.8.0.2',
  allowedIps: '10.8.0.2/32',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('WireGuard VPN API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  });

  // ===== 状态 =====

  it('GET /api/vpn/status 无配置应返回未运行', async () => {
    // wg show 失败 → running: false
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'no such device' });

    const res = await request(app).get('/api/vpn/status');
    expect(res.status).toBe(200);
    expect(res.body.data.running).toBe(false);
    expect(res.body.data.publicKey).toBeNull();
    expect(res.body.data.peerCount).toBe(0);
  });

  it('GET /api/vpn/status 有配置且 wg 运行中', async () => {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes('server.json')) return Promise.resolve(SERVER_CFG);
      if (filePath.includes('peers.json')) return Promise.resolve(JSON.stringify([PEER_RECORD]));
      return Promise.reject(new Error('ENOENT'));
    });
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: 'interface: wg0', stderr: '' });

    const res = await request(app).get('/api/vpn/status');
    expect(res.status).toBe(200);
    expect(res.body.data.running).toBe(true);
    expect(res.body.data.publicKey).toBe('server-pub');
    expect(res.body.data.listenPort).toBe(51820);
    expect(res.body.data.peerCount).toBe(1);
  });

  it('GET /api/vpn/status wg 命令抛异常应降级', async () => {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes('server.json')) return Promise.resolve(SERVER_CFG);
      return Promise.reject(new Error('ENOENT'));
    });
    mockExecuteCommand.mockRejectedValue(new Error('wg not found'));

    const res = await request(app).get('/api/vpn/status');
    expect(res.status).toBe(200);
    expect(res.body.data.running).toBe(false);
  });

  // ===== 初始化 =====

  it('POST /api/vpn/server 应初始化服务器', async () => {
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'bash') {
        return Promise.resolve({ exitCode: 0, stdout: 'fake-key-' + Math.random().toString(36).slice(2), stderr: '' });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    const res = await request(app)
      .post('/api/vpn/server')
      .send({ port: 51820, subnet: '10.8.0.0/24', dns: '10.8.0.1' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('POST /api/vpn/server 不带 dns', async () => {
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'bash') {
        return Promise.resolve({ exitCode: 0, stdout: 'fake-key', stderr: '' });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    const res = await request(app)
      .post('/api/vpn/server')
      .send({ port: 51820, subnet: '10.8.0.0/24' });
    expect(res.status).toBe(201);
  });

  it('POST /api/vpn/server 已初始化应 409', async () => {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes('server.json')) return Promise.resolve(SERVER_CFG);
      return Promise.reject(new Error('ENOENT'));
    });

    const res = await request(app)
      .post('/api/vpn/server')
      .send({ port: 51820, subnet: '10.8.0.0/24' });
    expect(res.status).toBe(409);
  });

  it('POST /api/vpn/server wg genkey 失败应 500', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });

    const res = await request(app)
      .post('/api/vpn/server')
      .send({ port: 51820, subnet: '10.8.0.0/24' });
    expect(res.status).toBe(500);
  });

  // ===== 更新 =====

  it('PUT /api/vpn/server 未初始化应 404', async () => {
    const res = await request(app)
      .put('/api/vpn/server')
      .send({ port: 51821 });
    expect(res.status).toBe(404);
  });

  it('PUT /api/vpn/server 应更新配置', async () => {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes('server.json')) return Promise.resolve(SERVER_CFG);
      if (filePath.includes('peers.json')) return Promise.resolve(JSON.stringify([PEER_RECORD]));
      return Promise.reject(new Error('ENOENT'));
    });

    const res = await request(app)
      .put('/api/vpn/server')
      .send({ port: 51821, dns: '8.8.8.8' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // ===== Peer 列表 =====

  it('GET /api/vpn/peers 无 peer 应返回空', async () => {
    const res = await request(app).get('/api/vpn/peers');
    expect(res.status).toBe(200);
    expect(res.body.data.peers).toEqual([]);
  });

  it('GET /api/vpn/peers 有运行时信息', async () => {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes('peers.json')) return Promise.resolve(JSON.stringify([PEER_RECORD]));
      return Promise.reject(new Error('ENOENT'));
    });
    mockExecuteCommand.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'wg' && args[2] === 'peers') {
        return Promise.resolve({ exitCode: 0, stdout: 'peer-pub-key\n', stderr: '' });
      }
      if (cmd === 'wg' && args.includes('latest-handshakes')) {
        return Promise.resolve({ exitCode: 0, stdout: '1234567890\t1024\t2048\t1.2.3.4:51820', stderr: '' });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    const res = await request(app).get('/api/vpn/peers');
    expect(res.status).toBe(200);
    const peer = res.body.data.peers[0];
    expect(peer.name).toBe('test-peer');
    expect(peer.rxBytes).toBe(1024);
    expect(peer.txBytes).toBe(2048);
    expect(peer.endpoint).toBe('1.2.3.4:51820');
  });

  // ===== 添加 Peer =====

  it('POST /api/vpn/peers 未初始化应 404', async () => {
    const res = await request(app)
      .post('/api/vpn/peers')
      .send({ name: 'test-peer' });
    expect(res.status).toBe(404);
  });

  it('POST /api/vpn/peers 应添加 peer', async () => {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes('server.json')) return Promise.resolve(SERVER_CFG);
      return Promise.reject(new Error('ENOENT'));
    });
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'bash') {
        return Promise.resolve({ exitCode: 0, stdout: 'new-peer-key', stderr: '' });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    const res = await request(app)
      .post('/api/vpn/peers')
      .send({ name: 'new-peer' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('new-peer');
    expect(res.body.data.address).toBe('10.8.0.2');
  });

  it('POST /api/vpn/peers 带自定义 allowedIps', async () => {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes('server.json')) return Promise.resolve(SERVER_CFG);
      return Promise.reject(new Error('ENOENT'));
    });
    mockExecuteCommand.mockImplementation((cmd: string) => {
      if (cmd === 'bash') {
        return Promise.resolve({ exitCode: 0, stdout: 'new-peer-key', stderr: '' });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    const res = await request(app)
      .post('/api/vpn/peers')
      .send({ name: 'custom-peer', allowedIps: '10.8.0.0/24' });
    expect(res.status).toBe(201);
  });

  // ===== 删除 Peer =====

  it('DELETE /api/vpn/peers/:pubkey 不存在应 404', async () => {
    const res = await request(app).delete('/api/vpn/peers/nonexistent');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/vpn/peers/:pubkey 应删除', async () => {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes('peers.json')) return Promise.resolve(JSON.stringify([PEER_RECORD]));
      return Promise.reject(new Error('ENOENT'));
    });

    const res = await request(app).delete('/api/vpn/peers/peer-pub-key');
    expect(res.status).toBe(200);
    expect(res.body.data.removed).toBe(true);
  });

  // ===== 导出配置 =====

  it('GET /api/vpn/peers/:pubkey/config 不存在应 404', async () => {
    const res = await request(app).get('/api/vpn/peers/nonexistent/config');
    expect(res.status).toBe(404);
  });

  it('GET /api/vpn/peers/:pubkey/config 应导出配置', async () => {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes('server.json')) return Promise.resolve(SERVER_CFG);
      if (filePath.includes('peers.json')) return Promise.resolve(JSON.stringify([PEER_RECORD]));
      return Promise.reject(new Error('ENOENT'));
    });
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '192.168.1.100', stderr: '' });

    const res = await request(app).get('/api/vpn/peers/peer-pub-key/config');
    expect(res.status).toBe(200);
    expect(res.text).toContain('[Interface]');
    expect(res.text).toContain('PrivateKey = peer-priv-key');
    expect(res.text).toContain('Endpoint = 192.168.1.100:51820');
    expect(res.text).toContain('DNS = 10.8.0.1');
  });

  it('GET /api/vpn/peers/:pubkey/config hostname 失败应降级', async () => {
    mockReadFile.mockImplementation((filePath: string) => {
      if (filePath.includes('server.json')) return Promise.resolve(SERVER_CFG);
      if (filePath.includes('peers.json')) return Promise.resolve(JSON.stringify([PEER_RECORD]));
      return Promise.reject(new Error('ENOENT'));
    });
    mockExecuteCommand.mockRejectedValue(new Error('hostname failed'));

    const res = await request(app).get('/api/vpn/peers/peer-pub-key/config');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Endpoint = SERVER_IP:51820');
  });
});
