/**
 * 模块：动态 DNS — 单元测试
 * mock 网络请求（fetch）和文件系统（dao 层）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ---------- mock 依赖 ---------- */

const mockLoadConfig = vi.fn();
const mockSaveConfig = vi.fn();
const mockLoadHistory = vi.fn();
const mockAppendHistory = vi.fn();

vi.mock('../ddns.dao.js', () => ({
  loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
  saveConfig: (...args: unknown[]) => mockSaveConfig(...args),
  loadHistory: (...args: unknown[]) => mockLoadHistory(...args),
  appendHistory: (...args: unknown[]) => mockAppendHistory(...args),
  defaultConfig: () => ({
    enabled: false,
    intervalMinutes: 30,
    ipCheckUrls: ['https://api.ipify.org'],
    records: [],
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import * as service from '../ddns.service.js';
import { AppError } from '../../../common/app-error.js';
import type { DdnsConfig, DdnsRecord } from '../ddns.types.js';

/* ---------- 辅助 ---------- */

function makeConfig(overrides: Partial<DdnsConfig> = {}): DdnsConfig {
  return {
    enabled: true,
    intervalMinutes: 30,
    ipCheckUrls: ['https://api.ipify.org'],
    records: [],
    ...overrides,
  };
}

function makeRecord(overrides: Partial<DdnsRecord> = {}): DdnsRecord {
  return {
    id: 'rec-1',
    enabled: true,
    provider: 'cloudflare',
    domain: 'example.com',
    subdomain: 'nas',
    recordType: 'A',
    credentials: { apiToken: '***', zoneId: 'zone-1' },
    lastIp: null,
    lastUpdated: null,
    lastStatus: null,
    ...overrides,
  };
}

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function textResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

function errorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

/* ---------- 测试 ---------- */

describe('动态 DNS 模块', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadHistory.mockResolvedValue([]);
    mockAppendHistory.mockResolvedValue(undefined);
    mockSaveConfig.mockResolvedValue(undefined);
  });

  /* ===== 网络连通性 ===== */

  describe('checkOnline', () => {
    it('网络可达时应返回 true', async () => {
      mockFetch.mockResolvedValue(okResponse('1.2.3.4'));
      const online = await service.checkOnline(['https://api.ipify.org']);
      expect(online).toBe(true);
    });

    it('所有地址不可达时应返回 false', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const online = await service.checkOnline(['https://a.com', 'https://b.com']);
      expect(online).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('第一个失败第二个成功应返回 true', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(okResponse('ok'));
      const online = await service.checkOnline(['https://a.com', 'https://b.com']);
      expect(online).toBe(true);
    });
  });

  /* ===== 公网 IP 获取 ===== */

  describe('getPublicIp', () => {
    it('应返回有效 IPv4', async () => {
      mockFetch.mockResolvedValue(textResponse('203.0.113.42'));
      const ip = await service.getPublicIp(['https://api.ipify.org']);
      expect(ip).toBe('203.0.113.42');
    });

    it('应返回有效 IPv6', async () => {
      mockFetch.mockResolvedValue(textResponse('2001:db8::1'));
      const ip = await service.getPublicIp(['https://api.ipify.org']);
      expect(ip).toBe('2001:db8::1');
    });

    it('所有源失败时应返回 null', async () => {
      mockFetch.mockRejectedValue(new Error('offline'));
      const ip = await service.getPublicIp(['https://a.com']);
      expect(ip).toBeNull();
    });

    it('返回非 IP 文本时应跳过', async () => {
      mockFetch.mockResolvedValue(textResponse('<html>not an ip</html>'));
      const ip = await service.getPublicIp(['https://a.com']);
      expect(ip).toBeNull();
    });
  });

  /* ===== 状态 ===== */

  describe('getStatus', () => {
    it('应返回完整状态结构', async () => {
      const config = makeConfig({ records: [makeRecord()] });
      mockLoadConfig.mockResolvedValue(config);
      mockFetch.mockResolvedValue(textResponse('1.2.3.4'));

      const status = await service.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.online).toBe(true);
      expect(status.publicIp).toBe('1.2.3.4');
      expect(status.recordCount).toBe(1);
      expect(status.records[0]?.domain).toBe('example.com');
    });

    it('离线时 publicIp 应为 null', async () => {
      mockLoadConfig.mockResolvedValue(makeConfig());
      mockFetch.mockRejectedValue(new Error('offline'));

      const status = await service.getStatus();
      expect(status.online).toBe(false);
      expect(status.publicIp).toBeNull();
    });
  });

  /* ===== 配置管理 ===== */

  describe('updateConfig', () => {
    it('应合并更新 enabled 和 intervalMinutes', async () => {
      mockLoadConfig.mockResolvedValue(makeConfig());
      const result = await service.updateConfig({ enabled: false, intervalMinutes: 60 });
      expect(result.enabled).toBe(false);
      expect(result.intervalMinutes).toBe(60);
      expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    });

    it('应支持替换 records 数组', async () => {
      mockLoadConfig.mockResolvedValue(makeConfig());
      const records = [makeRecord({ id: 'new-1' })];
      const result = await service.updateConfig({ records });
      expect(result.records).toHaveLength(1);
      expect(result.records[0]?.id).toBe('new-1');
    });
  });

  describe('addRecord / removeRecord', () => {
    it('addRecord 应生成 id 并追加', async () => {
      mockLoadConfig.mockResolvedValue(makeConfig());
      const rec = await service.addRecord({
        enabled: true,
        provider: 'aliyun',
        domain: 'test.cn',
        subdomain: 'home',
        recordType: 'A',
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      });
      expect(rec.id).toBeTruthy();
      expect(rec.lastIp).toBeNull();
      expect(mockSaveConfig).toHaveBeenCalled();
    });

    it('removeRecord 不存在时应抛 404', async () => {
      mockLoadConfig.mockResolvedValue(makeConfig());
      await expect(service.removeRecord('nonexistent')).rejects.toThrow(AppError);
    });

    it('removeRecord 应删除指定记录', async () => {
      mockLoadConfig.mockResolvedValue(makeConfig({ records: [makeRecord({ id: 'r1' })] }));
      await service.removeRecord('r1');
      const saved = mockSaveConfig.mock.calls[0]?.[0] as DdnsConfig;
      expect(saved.records).toHaveLength(0);
    });
  });

  /* ===== 更新执行 ===== */

  describe('runUpdate', () => {
    it('DDNS 未启用时应抛错', async () => {
      mockLoadConfig.mockResolvedValue(makeConfig({ enabled: false }));
      await expect(service.runUpdate()).rejects.toThrow('DDNS 服务未启用');
    });

    it('离线时应返回 skipped 并记录历史', async () => {
      const config = makeConfig({ records: [makeRecord()] });
      mockLoadConfig.mockResolvedValue(config);
      mockFetch.mockRejectedValue(new Error('offline'));

      const results = await service.runUpdate();
      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe('skipped');
      expect(results[0]?.message).toContain('离线');
      expect(mockAppendHistory).toHaveBeenCalledTimes(1);
    });

    it('IP 未变化时应跳过更新', async () => {
      const record = makeRecord({ lastIp: '1.2.3.4' });
      const config = makeConfig({ records: [record] });
      mockLoadConfig.mockResolvedValue(config);
      // 第一次 fetch: checkOnline, 第二次: getPublicIp
      mockFetch
        .mockResolvedValueOnce(okResponse('ok'))
        .mockResolvedValueOnce(textResponse('1.2.3.4'));

      const results = await service.runUpdate();
      expect(results[0]?.status).toBe('skipped');
      expect(results[0]?.message).toContain('IP 未变化');
    });

    it('Cloudflare 更新成功应返回 success', async () => {
      const record = makeRecord({ lastIp: null });
      const config = makeConfig({ records: [record] });
      mockLoadConfig.mockResolvedValue(config);
      mockFetch
        .mockResolvedValueOnce(okResponse('ok'))          // checkOnline
        .mockResolvedValueOnce(textResponse('5.6.7.8'))   // getPublicIp
        .mockResolvedValueOnce(okResponse({               // CF list records
          success: true,
          result: [{ id: 'dns-rec-1' }],
        }))
        .mockResolvedValueOnce(okResponse({ success: true })); // CF update

      const results = await service.runUpdate();
      expect(results[0]?.status).toBe('success');
      expect(results[0]?.ip).toBe('5.6.7.8');
      expect(mockAppendHistory).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success', ip: '5.6.7.8' }),
      );
    });

    it('Cloudflare API 失败应返回 failed', async () => {
      const record = makeRecord();
      const config = makeConfig({ records: [record] });
      mockLoadConfig.mockResolvedValue(config);
      mockFetch
        .mockResolvedValueOnce(okResponse('ok'))
        .mockResolvedValueOnce(textResponse('9.9.9.9'))
        .mockResolvedValueOnce(okResponse({
          success: false,
          errors: [{ message: 'Invalid token' }],
        }));

      const results = await service.runUpdate();
      expect(results[0]?.status).toBe('failed');
      expect(results[0]?.message).toContain('Invalid token');
    });

    it('自定义 HTTP 接口更新成功', async () => {
      const record = makeRecord({
        provider: 'custom',
        credentials: {} as DdnsRecord['credentials'],
        custom: {
          url: 'https://ddns.example.com/update?ip={ip}&domain={domain}',
          method: 'GET',
        },
      });
      const config = makeConfig({ records: [record] });
      mockLoadConfig.mockResolvedValue(config);
      mockFetch
        .mockResolvedValueOnce(okResponse('ok'))
        .mockResolvedValueOnce(textResponse('10.0.0.1'))
        .mockResolvedValueOnce(okResponse('good'));

      const results = await service.runUpdate();
      expect(results[0]?.status).toBe('success');
      // 验证 URL 占位符替换
      const calledUrl = mockFetch.mock.calls[2]?.[0] as string;
      expect(calledUrl).toContain('ip=10.0.0.1');
      expect(calledUrl).toContain('domain=nas.example.com');
    });

    it('自定义接口返回错误应 failed', async () => {
      const record = makeRecord({
        provider: 'custom',
        credentials: {} as DdnsRecord['credentials'],
        custom: { url: 'https://x.com/u?ip={ip}', method: 'GET' },
      });
      const config = makeConfig({ records: [record] });
      mockLoadConfig.mockResolvedValue(config);
      mockFetch
        .mockResolvedValueOnce(okResponse('ok'))
        .mockResolvedValueOnce(textResponse('2.2.2.2'))
        .mockResolvedValueOnce(errorResponse(500, 'internal error'));

      const results = await service.runUpdate();
      expect(results[0]?.status).toBe('failed');
      expect(results[0]?.message).toContain('500');
    });

    it('禁用记录应被跳过', async () => {
      const record = makeRecord({ enabled: false });
      const config = makeConfig({ records: [record] });
      mockLoadConfig.mockResolvedValue(config);
      mockFetch
        .mockResolvedValueOnce(okResponse('ok'))
        .mockResolvedValueOnce(textResponse('1.1.1.1'));

      const results = await service.runUpdate();
      expect(results).toHaveLength(0);
    });

    it('阿里云 DNS 更新成功', async () => {
      const record = makeRecord({
        provider: 'aliyun',
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      });
      const config = makeConfig({ records: [record] });
      mockLoadConfig.mockResolvedValue(config);
      mockFetch
        .mockResolvedValueOnce(okResponse('ok'))
        .mockResolvedValueOnce(textResponse('3.3.3.3'))
        .mockResolvedValueOnce(okResponse({
          DomainRecords: { Record: [{ RecordId: 'ali-rec-1' }] },
        }))
        .mockResolvedValueOnce(okResponse({ RecordId: 'ali-rec-1' }));

      const results = await service.runUpdate();
      expect(results[0]?.status).toBe('success');
    });
  });

  /* ===== 历史 ===== */

  describe('getHistory', () => {
    it('应返回倒序历史', async () => {
      mockLoadHistory.mockResolvedValue([
        { id: '1', recordId: 'r', domain: 'a.com', provider: 'cloudflare', ip: '1.1.1.1', status: 'success', error: null, timestamp: '2025-01-01T00:00:00Z' },
        { id: '2', recordId: 'r', domain: 'a.com', provider: 'cloudflare', ip: '2.2.2.2', status: 'success', error: null, timestamp: '2025-01-02T00:00:00Z' },
      ]);
      const history = await service.getHistory(10);
      expect(history).toHaveLength(2);
      expect(history[0]?.id).toBe('2'); // 最新在前
    });

    it('应尊重 limit 参数', async () => {
      mockLoadHistory.mockResolvedValue(
        Array.from({ length: 100 }, (_, i) => ({
          id: String(i), recordId: 'r', domain: 'a.com', provider: 'custom',
          ip: '1.1.1.1', status: 'success', error: null, timestamp: new Date().toISOString(),
        })),
      );
      const history = await service.getHistory(5);
      expect(history).toHaveLength(5);
    });

    it('空历史应返回空数组', async () => {
      mockLoadHistory.mockResolvedValue([]);
      const history = await service.getHistory();
      expect(history).toEqual([]);
    });
  });
});
