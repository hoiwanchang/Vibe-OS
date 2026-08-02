/**
 * 模块：SNMP 监控 — 单元测试
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

const SNMP_CONFIG = JSON.stringify({
  community: 'testcommunity',
  listenAddress: '127.0.0.1',
  enabledGroups: ['cpu', 'memory', 'disk', 'network', 'temperature'],
});

describe('SNMP API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  });

  // ===== 服务状态 =====

  it('GET /api/snmp/status 服务运行中', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: 'active\n', stderr: '' });

    const res = await request(app).get('/api/snmp/status');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.running).toBe(true);
  });

  it('GET /api/snmp/status 服务未运行', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 3, stdout: 'inactive\n', stderr: '' });

    const res = await request(app).get('/api/snmp/status');
    expect(res.status).toBe(200);
    expect(res.body.data.running).toBe(false);
  });

  it('GET /api/snmp/status 命令异常应降级', async () => {
    mockExecuteCommand.mockRejectedValue(new Error('systemctl not found'));

    const res = await request(app).get('/api/snmp/status');
    expect(res.status).toBe(200);
    expect(res.body.data.running).toBe(false);
  });

  // ===== 服务控制 =====

  it('POST /api/snmp/start 应启动服务', async () => {
    const res = await request(app).post('/api/snmp/start');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain('启动');
    expect(mockExecuteCommand).toHaveBeenCalledWith('systemctl', ['start', 'snmpd']);
  });

  it('POST /api/snmp/start 失败应 500', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'unit not found' });

    const res = await request(app).post('/api/snmp/start');
    expect(res.status).toBe(500);
  });

  it('POST /api/snmp/stop 应停止服务', async () => {
    const res = await request(app).post('/api/snmp/stop');
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('停止');
    expect(mockExecuteCommand).toHaveBeenCalledWith('systemctl', ['stop', 'snmpd']);
  });

  it('POST /api/snmp/stop 失败应 500', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });

    const res = await request(app).post('/api/snmp/stop');
    expect(res.status).toBe(500);
  });

  it('POST /api/snmp/restart 应重启服务', async () => {
    const res = await request(app).post('/api/snmp/restart');
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('重启');
    expect(mockExecuteCommand).toHaveBeenCalledWith('systemctl', ['restart', 'snmpd']);
  });

  it('POST /api/snmp/restart 失败应 500', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });

    const res = await request(app).post('/api/snmp/restart');
    expect(res.status).toBe(500);
  });

  // ===== 配置管理 =====

  it('GET /api/snmp/config 无配置文件应返回默认值', async () => {
    const res = await request(app).get('/api/snmp/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.community).toBe('public');
    expect(res.body.data.listenAddress).toBe('0.0.0.0');
    expect(res.body.data.enabledGroups).toEqual(['cpu', 'memory', 'disk', 'network', 'temperature']);
  });

  it('GET /api/snmp/config 有配置文件应返回配置', async () => {
    mockReadFile.mockResolvedValue(SNMP_CONFIG);

    const res = await request(app).get('/api/snmp/config');
    expect(res.status).toBe(200);
    expect(res.body.data.community).toBe('testcommunity');
    expect(res.body.data.listenAddress).toBe('127.0.0.1');
  });

  it('GET /api/snmp/config 配置文件字段缺失应回退默认值', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ community: 'custom' }));

    const res = await request(app).get('/api/snmp/config');
    expect(res.status).toBe(200);
    expect(res.body.data.community).toBe('custom');
    expect(res.body.data.listenAddress).toBe('0.0.0.0');
    expect(res.body.data.enabledGroups).toEqual(['cpu', 'memory', 'disk', 'network', 'temperature']);
  });

  it('PUT /api/snmp/config 应更新配置', async () => {
    const res = await request(app)
      .put('/api/snmp/config')
      .send({ community: 'newcommunity', listenAddress: '192.168.1.1', enabledGroups: ['cpu', 'memory'] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.community).toBe('newcommunity');
    expect(res.body.data.listenAddress).toBe('192.168.1.1');
    expect(res.body.data.enabledGroups).toEqual(['cpu', 'memory']);
    expect(mockWriteFile).toHaveBeenCalled();
  });

  it('PUT /api/snmp/config 仅 community 应使用默认值', async () => {
    const res = await request(app)
      .put('/api/snmp/config')
      .send({ community: 'onlycommunity' });
    expect(res.status).toBe(200);
    expect(res.body.data.listenAddress).toBe('0.0.0.0');
    expect(res.body.data.enabledGroups).toEqual(['cpu', 'memory', 'disk', 'network', 'temperature']);
  });

  it('PUT /api/snmp/config community 为空应 400', async () => {
    const res = await request(app)
      .put('/api/snmp/config')
      .send({ community: '' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/snmp/config 无效 OID 组应 400', async () => {
    const res = await request(app)
      .put('/api/snmp/config')
      .send({ community: 'test', enabledGroups: ['cpu', 'invalidgroup'] });
    expect(res.status).toBe(400);
  });

  // ===== OID 数据 =====

  it('GET /api/snmp/oids 应返回解析后的 OID 数据', async () => {
    mockReadFile.mockResolvedValue(SNMP_CONFIG);
    mockExecuteCommand.mockImplementation((_cmd: string, args: string[]) => {
      const oid = args?.[args.length - 1];
      if (oid === '1.3.6.1.4.1.2021.10.1.3') {
        return Promise.resolve({
          exitCode: 0,
          stdout: [
            'UCD-SNMP-MIB::laLoad.1 = STRING: 0.50',
            'UCD-SNMP-MIB::laLoad.5 = STRING: 0.75',
            'UCD-SNMP-MIB::laLoad.15 = STRING: 1.00',
          ].join('\n'),
          stderr: '',
        });
      }
      if (oid === '1.3.6.1.4.1.2021.4') {
        return Promise.resolve({
          exitCode: 0,
          stdout: [
            'UCD-SNMP-MIB::memTotalReal.0 = INTEGER: 16384000',
            'UCD-SNMP-MIB::memAvailReal.0 = INTEGER: 8192000',
          ].join('\n'),
          stderr: '',
        });
      }
      if (oid === '1.3.6.1.4.1.2021.9') {
        return Promise.resolve({
          exitCode: 0,
          stdout: [
            'UCD-SNMP-MIB::dskDevice.1 = STRING: /dev/sda1',
            'UCD-SNMP-MIB::dskTotal.1 = INTEGER: 1000000',
            'UCD-SNMP-MIB::dskUsed.1 = INTEGER: 500000',
          ].join('\n'),
          stderr: '',
        });
      }
      if (oid === '1.3.6.1.2.1.2.2') {
        return Promise.resolve({
          exitCode: 0,
          stdout: [
            'IF-MIB::ifDescr.1 = STRING: eth0',
            'IF-MIB::ifInOctets.1 = Counter32: 123456',
            'IF-MIB::ifOutOctets.1 = Counter32: 654321',
          ].join('\n'),
          stderr: '',
        });
      }
      if (oid === '1.3.6.1.4.1.2021.13.16') {
        return Promise.resolve({
          exitCode: 0,
          stdout: [
            'UCD-SNMP-MIB::lmTempSensorsDevice.1 = STRING: CPU',
            'UCD-SNMP-MIB::lmTempSensorsValue.1 = Gauge32: 45000',
          ].join('\n'),
          stderr: '',
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    const res = await request(app).get('/api/snmp/oids');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    // CPU
    expect(data.cpu.loads).toEqual([0.5, 0.75, 1.0]);
    expect(data.cpu.averageLoad).toBeCloseTo(0.75, 1);
    // 内存
    expect(data.memory.totalKb).toBe(16384000);
    expect(data.memory.availableKb).toBe(8192000);
    expect(data.memory.usedKb).toBe(8192000);
    // 磁盘
    expect(data.disk).toHaveLength(1);
    expect(data.disk[0].description).toBe('/dev/sda1');
    expect(data.disk[0].totalKb).toBe(1000000);
    expect(data.disk[0].usedKb).toBe(500000);
    // 网络
    expect(data.network).toHaveLength(1);
    expect(data.network[0].name).toBe('eth0');
    expect(data.network[0].inOctets).toBe(123456);
    expect(data.network[0].outOctets).toBe(654321);
    // 温度
    expect(data.temperature).toHaveLength(1);
    expect(data.temperature[0].name).toBe('CPU');
    expect(data.temperature[0].value).toBe(45);
  });

  it('GET /api/snmp/oids snmpwalk 失败应返回空数据', async () => {
    mockReadFile.mockResolvedValue(SNMP_CONFIG);
    mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'Timeout' });

    const res = await request(app).get('/api/snmp/oids');
    expect(res.status).toBe(200);
    expect(res.body.data.cpu.loads).toEqual([]);
    expect(res.body.data.memory.totalKb).toBe(0);
    expect(res.body.data.disk).toEqual([]);
    expect(res.body.data.network).toEqual([]);
    expect(res.body.data.temperature).toEqual([]);
  });

  it('GET /api/snmp/oids 仅启用部分组', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      community: 'test',
      listenAddress: '0.0.0.0',
      enabledGroups: ['cpu'],
    }));
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'UCD-SNMP-MIB::laLoad.1 = STRING: 0.25',
      stderr: '',
    });

    const res = await request(app).get('/api/snmp/oids');
    expect(res.status).toBe(200);
    expect(res.body.data.cpu.loads).toEqual([0.25]);
    // 未启用的组应为空
    expect(res.body.data.memory.totalKb).toBe(0);
    expect(res.body.data.disk).toEqual([]);
  });

  it('GET /api/snmp/oids 无配置文件应使用默认 community', async () => {
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });

    const res = await request(app).get('/api/snmp/oids');
    expect(res.status).toBe(200);
    // 验证使用了默认 community 'public'
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'snmpwalk',
      ['-v', '2c', '-c', 'public', 'localhost', expect.any(String)],
    );
  });

  it('GET /api/snmp/oids 温度值小于 1000 不转换', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      community: 'test',
      enabledGroups: ['temperature'],
    }));
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: [
        'UCD-SNMP-MIB::lmTempSensorsDevice.1 = STRING: GPU',
        'UCD-SNMP-MIB::lmTempSensorsValue.1 = Gauge32: 65',
      ].join('\n'),
      stderr: '',
    });

    const res = await request(app).get('/api/snmp/oids');
    expect(res.status).toBe(200);
    expect(res.body.data.temperature[0].value).toBe(65);
  });

  it('GET /api/snmp/oids 空行和无效行应被忽略', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      community: 'test',
      enabledGroups: ['cpu'],
    }));
    mockExecuteCommand.mockResolvedValue({
      exitCode: 0,
      stdout: '\n\nUCD-SNMP-MIB::laLoad.1 = STRING: notanumber\n\n',
      stderr: '',
    });

    const res = await request(app).get('/api/snmp/oids');
    expect(res.status).toBe(200);
    expect(res.body.data.cpu.loads).toEqual([]);
    expect(res.body.data.cpu.averageLoad).toBe(0);
  });
});
