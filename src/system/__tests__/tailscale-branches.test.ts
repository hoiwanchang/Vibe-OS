/**
 * 分支覆盖最终补充 — 针对 tailscale/controller/service 的 ?? 默认值分支
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

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { getTailscaleStatus } from '../tailscale.js';

describe('tailscale 默认值分支', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Self 字段缺失时应使用默认值', async () => {
    mockExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({
        BackendState: 'Running',
        Self: {},
        Peer: {
          p1: {},
        },
      }),
      stderr: '',
      exitCode: 0,
    });
    const status = await getTailscaleStatus();
    expect(status.self?.hostname).toBe('');
    expect(status.self?.ips).toEqual([]);
    expect(status.self?.os).toBe('');
    expect(status.self?.online).toBe(false);
    expect(status.peers[0]?.hostname).toBe('');
    expect(status.peers[0]?.ips).toEqual([]);
    expect(status.peers[0]?.online).toBe(false);
    expect(status.peers[0]?.active).toBe(false);
  });

  it('BackendState 缺失时应返回 Unknown', async () => {
    mockExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ Self: null, Peer: null }),
      stderr: '',
      exitCode: 0,
    });
    const status = await getTailscaleStatus();
    expect(status.backendState).toBe('Unknown');
    expect(status.peers).toEqual([]);
  });

  it('Peer 为 null 时应返回空数组', async () => {
    mockExecuteCommand.mockResolvedValue({
      stdout: JSON.stringify({ BackendState: 'Stopped', Peer: null }),
      stderr: '',
      exitCode: 0,
    });
    const status = await getTailscaleStatus();
    expect(status.peers).toEqual([]);
  });
});
