/**
 * 模块：安全（IP 封禁） — 单元测试
 * mock iptables 命令执行和文件系统（dao 层）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ---------- mock 依赖 ---------- */

const mockLoadBanned = vi.fn();
const mockSaveBanned = vi.fn();
const mockLoadFailCounts = vi.fn();
const mockSaveFailCounts = vi.fn();
const mockLoadPolicy = vi.fn();
const mockSavePolicy = vi.fn();

vi.mock('../security.dao.js', () => ({
  loadBanned: (...args: unknown[]) => mockLoadBanned(...args),
  saveBanned: (...args: unknown[]) => mockSaveBanned(...args),
  loadFailCounts: (...args: unknown[]) => mockLoadFailCounts(...args),
  saveFailCounts: (...args: unknown[]) => mockSaveFailCounts(...args),
  loadPolicy: (...args: unknown[]) => mockLoadPolicy(...args),
  savePolicy: (...args: unknown[]) => mockSavePolicy(...args),
  defaultPolicy: () => ({
    maxAttempts: 5,
    banDurationHours: 24,
    whitelist: [],
  }),
}));

const mockExecuteCommandStrict = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));

import * as service from '../security.service.js';
import { AppError } from '../../../common/app-error.js';
import type { BannedEntry, SecurityPolicy } from '../security.types.js';

/* ---------- 辅助 ---------- */

function makePolicy(overrides: Partial<SecurityPolicy> = {}): SecurityPolicy {
  return {
    maxAttempts: 5,
    banDurationHours: 24,
    whitelist: [],
    ...overrides,
  };
}

function makeBannedEntry(overrides: Partial<BannedEntry> = {}): BannedEntry {
  return {
    ip: '10.0.0.1',
    reason: '测试封禁',
    source: 'manual',
    bannedAt: '2025-01-01T00:00:00.000Z',
    expiresAt: null,
    ...overrides,
  };
}

/* ---------- 测试 ---------- */

describe('安全（IP 封禁）模块', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadBanned.mockResolvedValue([]);
    mockSaveBanned.mockResolvedValue(undefined);
    mockLoadFailCounts.mockResolvedValue({});
    mockSaveFailCounts.mockResolvedValue(undefined);
    mockLoadPolicy.mockResolvedValue(makePolicy());
    mockSavePolicy.mockResolvedValue(undefined);
    mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  /* ===== 白名单检查 ===== */

  describe('isWhitelisted', () => {
    it('白名单内 IP 应返回 true', () => {
      expect(service.isWhitelisted('192.168.1.1', ['192.168.1.1', '10.0.0.1'])).toBe(true);
    });

    it('白名单外 IP 应返回 false', () => {
      expect(service.isWhitelisted('172.16.0.1', ['192.168.1.1'])).toBe(false);
    });

    it('空白名单应返回 false', () => {
      expect(service.isWhitelisted('1.2.3.4', [])).toBe(false);
    });
  });

  /* ===== 手动封禁 ===== */

  describe('banIp', () => {
    it('应成功封禁并调用 iptables', async () => {
      const entry = await service.banIp('10.0.0.99', '恶意扫描');
      expect(entry.ip).toBe('10.0.0.99');
      expect(entry.reason).toBe('恶意扫描');
      expect(entry.source).toBe('manual');
      expect(entry.expiresAt).toBeNull();
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith(
        'iptables',
        ['-I', 'INPUT', '-s', '10.0.0.99', '-j', 'DROP'],
      );
      expect(mockSaveBanned).toHaveBeenCalledTimes(1);
    });

    it('封禁白名单 IP 应抛错', async () => {
      mockLoadPolicy.mockResolvedValue(makePolicy({ whitelist: ['192.168.1.100'] }));
      await expect(service.banIp('192.168.1.100')).rejects.toThrow(AppError);
      await expect(service.banIp('192.168.1.100')).rejects.toThrow('白名单');
      expect(mockExecuteCommandStrict).not.toHaveBeenCalled();
    });

    it('重复封禁应抛 409', async () => {
      mockLoadBanned.mockResolvedValue([makeBannedEntry({ ip: '10.0.0.1' })]);
      await expect(service.banIp('10.0.0.1')).rejects.toThrow('已被封禁');
    });

    it('无 reason 时应使用默认原因', async () => {
      const entry = await service.banIp('10.0.0.50');
      expect(entry.reason).toBe('手动封禁');
    });
  });

  /* ===== 解封 ===== */

  describe('unbanIp', () => {
    it('应成功解封并调用 iptables', async () => {
      mockLoadBanned.mockResolvedValue([makeBannedEntry({ ip: '10.0.0.1' })]);
      await service.unbanIp('10.0.0.1');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith(
        'iptables',
        ['-D', 'INPUT', '-s', '10.0.0.1', '-j', 'DROP'],
      );
      expect(mockSaveBanned).toHaveBeenCalledWith([]);
    });

    it('解封不存在的 IP 应抛 404', async () => {
      mockLoadBanned.mockResolvedValue([]);
      await expect(service.unbanIp('99.99.99.99')).rejects.toThrow(AppError);
    });

    it('解封时应同时清除失败计数', async () => {
      mockLoadBanned.mockResolvedValue([makeBannedEntry({ ip: '10.0.0.1' })]);
      mockLoadFailCounts.mockResolvedValue({
        '10.0.0.1': { count: 3, lastAttempt: '2025-01-01T00:00:00Z' },
        '10.0.0.2': { count: 1, lastAttempt: '2025-01-01T00:00:00Z' },
      });
      await service.unbanIp('10.0.0.1');
      const savedCounts = mockSaveFailCounts.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(savedCounts['10.0.0.1']).toBeUndefined();
      expect(savedCounts['10.0.0.2']).toBeDefined();
    });
  });

  /* ===== 封禁列表 ===== */

  describe('getBannedList', () => {
    it('应返回未过期的封禁条目', async () => {
      const future = new Date(Date.now() + 3600_000).toISOString();
      mockLoadBanned.mockResolvedValue([
        makeBannedEntry({ ip: '1.1.1.1', expiresAt: future }),
        makeBannedEntry({ ip: '2.2.2.2', expiresAt: null }),
      ]);
      const list = await service.getBannedList();
      expect(list).toHaveLength(2);
    });

    it('应自动过滤已过期条目并持久化', async () => {
      const past = new Date(Date.now() - 3600_000).toISOString();
      const future = new Date(Date.now() + 3600_000).toISOString();
      mockLoadBanned.mockResolvedValue([
        makeBannedEntry({ ip: '1.1.1.1', expiresAt: past }),
        makeBannedEntry({ ip: '2.2.2.2', expiresAt: future }),
      ]);
      const list = await service.getBannedList();
      expect(list).toHaveLength(1);
      expect(list[0]?.ip).toBe('2.2.2.2');
      expect(mockSaveBanned).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ ip: '2.2.2.2' })]),
      );
    });

    it('空列表应返回空数组', async () => {
      mockLoadBanned.mockResolvedValue([]);
      const list = await service.getBannedList();
      expect(list).toEqual([]);
    });
  });

  /* ===== 登录失败计数与自动封禁 ===== */

  describe('recordFailure', () => {
    it('未达阈值时应递增计数且不封禁', async () => {
      mockLoadFailCounts.mockResolvedValue({
        '10.0.0.5': { count: 2, lastAttempt: '2025-01-01T00:00:00Z' },
      });
      const result = await service.recordFailure('10.0.0.5');
      expect(result.count).toBe(3);
      expect(result.banned).toBe(false);
      expect(result.whitelisted).toBe(false);
      expect(mockExecuteCommandStrict).not.toHaveBeenCalled();
    });

    it('达到阈值时应自动封禁并调用 iptables', async () => {
      mockLoadFailCounts.mockResolvedValue({
        '10.0.0.5': { count: 4, lastAttempt: '2025-01-01T00:00:00Z' },
      });
      const result = await service.recordFailure('10.0.0.5');
      expect(result.count).toBe(5);
      expect(result.banned).toBe(true);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith(
        'iptables',
        ['-I', 'INPUT', '-s', '10.0.0.5', '-j', 'DROP'],
      );
      // 封禁后应清除失败计数
      const savedCounts = mockSaveFailCounts.mock.calls.at(-1)?.[0] as Record<string, unknown>;
      expect(savedCounts['10.0.0.5']).toBeUndefined();
      // 应写入封禁列表
      const savedBanned = mockSaveBanned.mock.calls[0]?.[0] as BannedEntry[];
      expect(savedBanned).toHaveLength(1);
      expect(savedBanned[0]?.source).toBe('auto');
      expect(savedBanned[0]?.expiresAt).not.toBeNull();
    });

    it('白名单 IP 应豁免且不记录计数', async () => {
      mockLoadPolicy.mockResolvedValue(makePolicy({ whitelist: ['192.168.1.1'] }));
      const result = await service.recordFailure('192.168.1.1');
      expect(result.whitelisted).toBe(true);
      expect(result.banned).toBe(false);
      expect(result.count).toBe(0);
      expect(mockSaveFailCounts).not.toHaveBeenCalled();
      expect(mockExecuteCommandStrict).not.toHaveBeenCalled();
    });

    it('已封禁 IP 应直接返回 banned=true', async () => {
      mockLoadBanned.mockResolvedValue([makeBannedEntry({ ip: '10.0.0.5' })]);
      const result = await service.recordFailure('10.0.0.5');
      expect(result.banned).toBe(true);
      expect(result.count).toBe(0);
      expect(mockSaveFailCounts).not.toHaveBeenCalled();
    });

    it('首次失败应从 1 开始计数', async () => {
      mockLoadFailCounts.mockResolvedValue({});
      const result = await service.recordFailure('172.16.0.1');
      expect(result.count).toBe(1);
      expect(result.banned).toBe(false);
    });

    it('自定义阈值应生效', async () => {
      mockLoadPolicy.mockResolvedValue(makePolicy({ maxAttempts: 3 }));
      mockLoadFailCounts.mockResolvedValue({
        '10.0.0.9': { count: 2, lastAttempt: '2025-01-01T00:00:00Z' },
      });
      const result = await service.recordFailure('10.0.0.9');
      expect(result.count).toBe(3);
      expect(result.banned).toBe(true);
    });
  });

  /* ===== 策略管理 ===== */

  describe('getPolicy / updatePolicy', () => {
    it('getPolicy 应返回当前策略', async () => {
      mockLoadPolicy.mockResolvedValue(makePolicy({ maxAttempts: 10 }));
      const policy = await service.getPolicy();
      expect(policy.maxAttempts).toBe(10);
    });

    it('updatePolicy 应合并更新', async () => {
      mockLoadPolicy.mockResolvedValue(makePolicy());
      const result = await service.updatePolicy({ maxAttempts: 3, banDurationHours: 48 });
      expect(result.maxAttempts).toBe(3);
      expect(result.banDurationHours).toBe(48);
      expect(result.whitelist).toEqual([]);
      expect(mockSavePolicy).toHaveBeenCalledTimes(1);
    });

    it('updatePolicy 应支持更新白名单', async () => {
      mockLoadPolicy.mockResolvedValue(makePolicy());
      const result = await service.updatePolicy({ whitelist: ['192.168.1.1', '10.0.0.1'] });
      expect(result.whitelist).toEqual(['192.168.1.1', '10.0.0.1']);
    });

    it('updatePolicy 不传字段时应保持原值', async () => {
      mockLoadPolicy.mockResolvedValue(makePolicy({ maxAttempts: 7, banDurationHours: 12 }));
      const result = await service.updatePolicy({});
      expect(result.maxAttempts).toBe(7);
      expect(result.banDurationHours).toBe(12);
    });
  });
});
