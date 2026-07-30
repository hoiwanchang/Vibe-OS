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
  VIBEOS_APP_DIR: '/data/vibeos',
  COMMAND_TIMEOUT_MS: 5000,
}));

vi.mock('../filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

const mockWriteFile = vi.fn().mockResolvedValue(undefined);
vi.mock('node:fs/promises', () => ({
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

import {
  configureSubnetRouter,
  applyAclPolicy,
  tailscaleLogin,
  tailscaleLogout,
  tailscaleWhoami,
  tailscaleSetPrefs,
  tailscaleGetPrefs,
} from '../tailscale.js';

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

  describe('tailscaleLogin', () => {
    it('成功登录时返回 exitCode 0 和 backendState', async () => {
      // 第一次调用 up，第二次调用 status --json
      mockExecuteCommand
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ BackendState: 'Running' }),
          stderr: '',
          exitCode: 0,
        });
      const result = await tailscaleLogin({ controlUrl: 'http://hs:8080', authKey: 'key' });
      expect(result.exitCode).toBe(0);
      expect(result.backendState).toBe('Running');
      expect(result.authUrl).toBeNull();
      expect(result.errorDetail).toBe('');
    });

    it('等待浏览器授权时提取含 /login 的 authUrl', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'To authenticate, visit: https://login.tailscale.com/a/abc123',
          exitCode: 1,
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ BackendState: 'NeedsLogin' }),
          stderr: '',
          exitCode: 0,
        });
      const result = await tailscaleLogin({});
      expect(result.authUrl).toBe('https://login.tailscale.com/a/abc123');
      expect(result.exitCode).toBe(1);
    });

    it('不应把 controlUrl 误判为 authUrl', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({
          stdout: '',
          stderr: "can't change --login-server without --force-reauth",
          exitCode: 1,
        })
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ BackendState: 'Running' }),
          stderr: '',
          exitCode: 0,
        });
      const result = await tailscaleLogin({ controlUrl: 'http://10.99.99.99:8080' });
      expect(result.authUrl).toBeNull();
      expect(result.exitCode).toBe(1);
      expect(result.errorDetail).toContain('force-reauth');
    });
  });

  describe('tailscaleLogout', () => {
    it('应调用 tailscale logout', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await tailscaleLogout();
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('tailscale', ['logout']);
    });
  });

  describe('tailscaleWhoami', () => {
    it('已登录时返回用户标识', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: 'user@example.com\n',
        stderr: '',
        exitCode: 0,
      });
      expect(await tailscaleWhoami()).toBe('user@example.com');
    });

    it('未登录时返回 null', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'not logged in', exitCode: 1 });
      expect(await tailscaleWhoami()).toBeNull();
    });
  });

  describe('tailscaleSetPrefs', () => {
    it('应组装正确的 set 参数', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await tailscaleSetPrefs({ acceptRoutes: true, exitNode: '100.64.0.1' });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('tailscale', [
        'set',
        '--accept-routes',
        '--exit-node=100.64.0.1',
      ]);
    });

    it('无参数时跳过调用', async () => {
      await tailscaleSetPrefs({});
      expect(mockExecuteCommandStrict).not.toHaveBeenCalled();
    });

    it('空 exitNode 应生成 --exit-node= 以清除', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await tailscaleSetPrefs({ exitNode: '' });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('tailscale', [
        'set',
        '--exit-node=',
      ]);
    });
  });

  describe('tailscaleGetPrefs', () => {
    it('status 失败时返回默认值', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'err', exitCode: 1 });
      const prefs = await tailscaleGetPrefs();
      expect(prefs).toEqual({
        acceptRoutes: false,
        exitNode: '',
        exitNodeAllowLanAccess: false,
        advertiseExitNode: false,
      });
    });

    it('应从 status JSON 推断偏好', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: JSON.stringify({
          Self: { AllowedIPs: ['10.0.0.0/8'], ExitNode: true },
          ExitNodeStatus: { TailscaleIPs: ['100.64.0.5'] },
        }),
        stderr: '',
        exitCode: 0,
      });
      const prefs = await tailscaleGetPrefs();
      expect(prefs.acceptRoutes).toBe(true);
      expect(prefs.advertiseExitNode).toBe(true);
      expect(prefs.exitNode).toBe('100.64.0.5');
    });
  });
});
