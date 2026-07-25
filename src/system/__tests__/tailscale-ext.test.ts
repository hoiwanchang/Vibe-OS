/**
 * 系统层：tailscale 扩展测试
 * 覆盖 configureSubnetRouter, applyAclPolicy
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();
vi.mock('../command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));

vi.mock('../../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  COMMAND_TIMEOUT_MS: 5000,
}));

vi.mock('../filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

const mockWriteFile = vi.fn().mockResolvedValue(undefined);
vi.mock('node:fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

import { configureSubnetRouter, applyAclPolicy } from '../tailscale.js';

describe('tailscale 扩展', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('configureSubnetRouter', () => {
    it('应调用 tailscale up --advertise-routes', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await configureSubnetRouter(['192.168.1.0/24', '10.0.0.0/8']);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith(
        'tailscale',
        ['up', '--advertise-routes=192.168.1.0/24,10.0.0.0/8'],
      );
    });
  });

  describe('applyAclPolicy', () => {
    it('应保存 ACL 策略到本地文件', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const policy = JSON.stringify({ acls: [] });
      await applyAclPolicy(policy);
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('acl-policy.json'),
        policy,
        'utf-8',
      );
    });
  });
});
