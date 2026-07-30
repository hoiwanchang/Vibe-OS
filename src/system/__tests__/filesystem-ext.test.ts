/**
 * 系统层：filesystem 扩展测试
 * 覆盖 getDirUsageBytes, getQuotaInfo, setUserQuota
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockAccess = vi.fn().mockResolvedValue(undefined);
const mockStat = vi.fn().mockResolvedValue({ mode: 0o700 });
vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  access: (...args: unknown[]) => mockAccess(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  writeFile: vi.fn().mockResolvedValue(undefined),
  constants: { W_OK: 2 },
}));

vi.mock('../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  SECRETS_DIR: '/data/vibeos/secrets',
  SYSTEM_CACHE_DIR: '/data/vibeos/cache',
  COMMAND_TIMEOUT_MS: 5000,
}));

const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();
vi.mock('../command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));

import { getDirUsageBytes, getQuotaInfo, setUserQuota } from '../filesystem.js';

describe('filesystem 扩展', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDirUsageBytes', () => {
    it('应返回目录使用量', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '524288000\t/data/1000\n', stderr: '', exitCode: 0 });
      const bytes = await getDirUsageBytes('/data/1000');
      expect(bytes).toBe(524288000n);
    });

    it('目录不存在应返回 0', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'No such file', exitCode: 1 });
      const bytes = await getDirUsageBytes('/data/9999');
      expect(bytes).toBe(0n);
    });

    it('应拒绝 /data 外路径', async () => {
      await expect(getDirUsageBytes('/etc')).rejects.toThrow('路径穿越');
    });
  });

  describe('getQuotaInfo', () => {
    it('应解析 quota 输出', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: 'Disk quotas for user testuser (uid 1000):\nFilesystem blocks quota limit\n/dev/sda1 512000 104857600 0 0\n/data 512000 104857600 0 0\n',
        stderr: '',
        exitCode: 0,
      });
      const info = await getQuotaInfo(1000);
      expect(info).not.toBeNull();
      expect(info?.usedBytes).toBe(524288000n);
      expect(info?.quotaBytes).toBe(107374182400n);
    });

    it('命令失败应返回 null', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });
      const info = await getQuotaInfo(9999);
      expect(info).toBeNull();
    });
  });

  describe('setUserQuota', () => {
    it('应调用 setquota 命令', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await setUserQuota(1000, 107374182400n);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith(
        'setquota',
        expect.arrayContaining(['-u', '1000']),
      );
    });
  });
});
