/**
 * 系统层：docker + tailscale 单元测试
 * Mock command-executor 测试 CLI 封装逻辑
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

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import {
  deployContainer,
  listContainers,
  getContainerLogs,
  isDockerAvailable,
} from '../docker.js';
import {
  getTailscaleStatus,
  getSubnetRoutes,
  isTailscaleAvailable,
} from '../tailscale.js';

describe('docker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deployContainer', () => {
    it('应构建正确的 docker run 命令', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: 'abc123\n', stderr: '', exitCode: 0 });

      const id = await deployContainer({
        name: 'ollama',
        image: 'ollama/ollama:latest',
        ports: [{ host: 11434, container: 11434 }],
        env: { OLLAMA_HOST: '0.0.0.0' },
        volumes: [{ host: '/data/vibeos/ollama', container: '/root/.ollama', readonly: false }],
        memoryLimit: '4g',
        cpuLimit: 2,
        restartPolicy: 'unless-stopped',
      });

      expect(id).toBe('abc123');
      const callArgs = mockExecuteCommandStrict.mock.calls[0]?.[1] as string[];
      expect(callArgs).toContain('--name');
      expect(callArgs).toContain('ollama');
      expect(callArgs).toContain('-p');
      expect(callArgs).toContain('11434:11434');
      expect(callArgs).toContain('--memory');
      expect(callArgs).toContain('4g');
    });
  });

  describe('listContainers', () => {
    it('应解析 docker ps JSON 输出', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: '{"ID":"abc","Names":"ollama","Image":"ollama:latest","Status":"Up 2h","State":"running","Ports":"11434/tcp","CreatedAt":"2024-01-01"}\n',
        stderr: '',
        exitCode: 0,
      });

      const containers = await listContainers();
      expect(containers).toHaveLength(1);
      expect(containers[0]?.name).toBe('ollama');
    });

    it('命令失败应返回空数组', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });
      const containers = await listContainers();
      expect(containers).toHaveLength(0);
    });
  });

  describe('getContainerLogs', () => {
    it('应返回日志内容', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: 'log line\n', stderr: '', exitCode: 0 });
      const logs = await getContainerLogs('ollama', 50);
      expect(logs.stdout).toBe('log line\n');
    });
  });

  describe('isDockerAvailable', () => {
    it('Docker 可用应返回 true', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '24.0.7', stderr: '', exitCode: 0 });
      expect(await isDockerAvailable()).toBe(true);
    });

    it('Docker 不可用应返回 false', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'not found', exitCode: 1 });
      expect(await isDockerAvailable()).toBe(false);
    });
  });
});

describe('tailscale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTailscaleStatus', () => {
    it('应解析 tailscale status JSON', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: JSON.stringify({
          BackendState: 'Running',
          Self: { HostName: 'nas', TailscaleIPs: ['100.64.0.1'], OS: 'linux', Online: true },
          Peer: {
            peer1: { HostName: 'laptop', TailscaleIPs: ['100.64.0.2'], OS: 'windows', Online: true, Active: true },
          },
        }),
        stderr: '',
        exitCode: 0,
      });

      const status = await getTailscaleStatus();
      expect(status.backendState).toBe('Running');
      expect(status.self?.hostname).toBe('nas');
      expect(status.peers).toHaveLength(1);
      expect(status.peers[0]?.hostname).toBe('laptop');
    });

    it('Tailscale 不可用应返回降级状态', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'not running', exitCode: 1 });
      const status = await getTailscaleStatus();
      expect(status.backendState).toBe('NotRunning');
      expect(status.error).toBeTruthy();
    });
  });

  describe('getSubnetRoutes', () => {
    it('应解析 AllowedIPs 中的子网', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: JSON.stringify({
          Self: { AllowedIPs: ['100.64.0.1/32', '192.168.1.0/24'] },
        }),
        stderr: '',
        exitCode: 0,
      });

      const routes = await getSubnetRoutes();
      expect(routes).toHaveLength(1); // 只返回含 / 的非 /32
      expect(routes[0]?.cidr).toBe('192.168.1.0/24');
    });
  });

  describe('isTailscaleAvailable', () => {
    it('可用应返回 true', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '1.56.0', stderr: '', exitCode: 0 });
      expect(await isTailscaleAvailable()).toBe(true);
    });
  });
});
