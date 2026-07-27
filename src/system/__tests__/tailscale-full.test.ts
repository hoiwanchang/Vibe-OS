/**
 * 系统层：tailscale 完整覆盖 — login/logout/whoami/setPrefs/getPrefs
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();
vi.mock('../command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));
vi.mock('../../config.js', () => ({
  COMMAND_TIMEOUT_MS: 5000,
}));

import {
  tailscaleLogin,
  tailscaleLogout,
  tailscaleWhoami,
  tailscaleSetPrefs,
  tailscaleGetPrefs,
} from '../tailscale.js';

describe('tailscale 扩展功能', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('tailscaleLogin', () => {
    it('基本登录应返回 backendState', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ exitCode: 0, stdout: 'Success', stderr: '' })
        .mockResolvedValueOnce({ exitCode: 0, stdout: JSON.stringify({ BackendState: 'Running', Self: {}, Peer: {} }), stderr: '' });
      const result = await tailscaleLogin({});
      expect(result.backendState).toBe('Running');
      expect(result.exitCode).toBe(0);
    });

    it('带 controlUrl 和 authKey 应传递参数', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })
        .mockResolvedValueOnce({ exitCode: 0, stdout: JSON.stringify({ BackendState: 'Running', Self: {}, Peer: {} }), stderr: '' });
      await tailscaleLogin({ controlUrl: 'https://hs.example.com', authKey: 'tskey-xxx', exitNode: true, acceptRoutes: true });
      const firstCall = mockExecuteCommand.mock.calls[0];
      expect(firstCall[1]).toContain('--login-server=https://hs.example.com');
      expect(firstCall[1]).toContain('--auth-key=tskey-xxx');
      expect(firstCall[1]).toContain('--advertise-exit-node');
      expect(firstCall[1]).toContain('--accept-routes');
    });

    it('登录失败应返回非零 exitCode', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'To authenticate, visit: https://login.tailscale.com/a/xxx' })
        .mockResolvedValueOnce({ exitCode: 0, stdout: JSON.stringify({ BackendState: 'NeedsLogin', Self: {}, Peer: {} }), stderr: '' });
      const result = await tailscaleLogin({});
      expect(result.exitCode).toBe(1);
      expect(result.backendState).toBe('NeedsLogin');
    });
  });

  describe('tailscaleLogout', () => {
    it('应调用 tailscale logout', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      await tailscaleLogout();
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('tailscale', ['logout']);
    });
  });

  describe('tailscaleWhoami', () => {
    it('已登录应返回用户标识', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: 'user@example.com\n', stderr: '' });
      const result = await tailscaleWhoami();
      expect(result).toBe('user@example.com');
    });

    it('未登录应返回 null', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'not logged in' });
      const result = await tailscaleWhoami();
      expect(result).toBeNull();
    });

    it('空输出应返回 null', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const result = await tailscaleWhoami();
      expect(result).toBeNull();
    });
  });

  describe('tailscaleSetPrefs', () => {
    it('设置 acceptRoutes', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      await tailscaleSetPrefs({ acceptRoutes: true });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('tailscale', ['set', '--accept-routes']);
    });

    it('设置 exitNode', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      await tailscaleSetPrefs({ exitNode: '100.64.0.1' });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('tailscale', ['set', '--exit-node=100.64.0.1']);
    });

    it('清空 exitNode', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      await tailscaleSetPrefs({ exitNode: '' });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('tailscale', ['set', '--exit-node=']);
    });

    it('设置 exitNodeAllowLanAccess false', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      await tailscaleSetPrefs({ exitNodeAllowLanAccess: false });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('tailscale', ['set', '--exit-node-allow-lan-access=false']);
    });

    it('设置 advertiseExitNode', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      await tailscaleSetPrefs({ advertiseExitNode: true });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('tailscale', ['set', '--advertise-exit-node']);
    });

    it('无参数应跳过调用', async () => {
      await tailscaleSetPrefs({});
      expect(mockExecuteCommandStrict).not.toHaveBeenCalled();
    });
  });

  describe('tailscaleGetPrefs', () => {
    it('应解析 status --json', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({
          Self: { AllowedIPs: ['100.64.0.0/10'], ExitNode: true },
          ExitNodeStatus: { TailscaleIPs: ['100.64.1.1'] },
        }),
        stderr: '',
      });
      const prefs = await tailscaleGetPrefs();
      expect(prefs.acceptRoutes).toBe(true);
      expect(prefs.exitNode).toBe('100.64.1.1');
      expect(prefs.advertiseExitNode).toBe(true);
    });

    it('命令失败应返回默认值', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'err' });
      const prefs = await tailscaleGetPrefs();
      expect(prefs.acceptRoutes).toBe(false);
      expect(prefs.exitNode).toBe('');
    });

    it('JSON 解析失败应返回默认值', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: 'not json', stderr: '' });
      const prefs = await tailscaleGetPrefs();
      expect(prefs.acceptRoutes).toBe(false);
    });
  });
});
