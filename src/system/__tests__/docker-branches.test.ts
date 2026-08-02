/**
 * 系统层：docker.ts 分支覆盖测试
 * Mock command-executor，直接测试 docker CLI 封装的全部分支
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();

vi.mock('../command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));

import {
  deployContainer,
  restartContainer,
  stopContainer,
  removeContainer,
  listContainers,
  getContainerLogs,
  isDockerAvailable,
} from '../docker.js';

describe('system/docker 分支覆盖', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteCommandStrict.mockResolvedValue({ stdout: 'container-id-123\n', stderr: '', exitCode: 0 });
    mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  describe('deployContainer', () => {
    it('最小参数（无 ports/env/volumes/memory/cpu/network）', async () => {
      const id = await deployContainer({ name: 'test', image: 'img:latest' });
      expect(id).toBe('container-id-123');
      const args = mockExecuteCommandStrict.mock.calls[0][1] as string[];
      expect(args).toContain('--restart');
      expect(args).toContain('unless-stopped');
      expect(args).not.toContain('-p');
      expect(args).not.toContain('-e');
      expect(args).not.toContain('-v');
      expect(args).not.toContain('--memory');
      expect(args).not.toContain('--cpus');
      expect(args).not.toContain('--network');
    });

    it('全参数（ports/env/volumes+readonly/memory/cpu/network/restartPolicy）', async () => {
      await deployContainer({
        name: 'full',
        image: 'img:latest',
        ports: [{ host: 8080, container: 80 }],
        env: { FOO: 'bar' },
        volumes: [
          { host: '/data/a', container: '/a', readonly: true },
          { host: '/data/b', container: '/b', readonly: false },
        ],
        memoryLimit: '512m',
        cpuLimit: 2,
        network: 'mynet',
        restartPolicy: 'always',
      });
      const args = mockExecuteCommandStrict.mock.calls[0][1] as string[];
      expect(args).toContain('-p');
      expect(args).toContain('8080:80');
      expect(args).toContain('-e');
      expect(args).toContain('FOO=bar');
      expect(args).toContain('/data/a:/a:ro');
      expect(args).toContain('/data/b:/b');
      expect(args).toContain('--memory');
      expect(args).toContain('512m');
      expect(args).toContain('--cpus');
      expect(args).toContain('2');
      expect(args).toContain('--network');
      expect(args).toContain('mynet');
      expect(args).toContain('always');
    });
  });

  describe('restartContainer / stopContainer', () => {
    it('restartContainer 调用 docker restart', async () => {
      await restartContainer('myapp');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('docker', ['restart', 'myapp']);
    });

    it('stopContainer 调用 docker stop', async () => {
      await stopContainer('myapp');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('docker', ['stop', 'myapp']);
    });
  });

  describe('removeContainer', () => {
    it('force=false 不带 -f', async () => {
      await removeContainer('myapp');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('docker', ['rm', 'myapp']);
    });

    it('force=true 带 -f', async () => {
      await removeContainer('myapp', true);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('docker', ['rm', '-f', 'myapp']);
    });
  });

  describe('listContainers', () => {
    it('all=true 带 -a', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await listContainers(true);
      const args = mockExecuteCommand.mock.calls[0][1] as string[];
      expect(args).toContain('-a');
    });

    it('all=false 不带 -a', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await listContainers(false);
      const args = mockExecuteCommand.mock.calls[0][1] as string[];
      expect(args).not.toContain('-a');
    });

    it('exitCode !== 0 返回空数组', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'err', exitCode: 1 });
      const result = await listContainers();
      expect(result).toEqual([]);
    });

    it('解析多行 JSON + 跳过非法行', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: [
          '{"ID":"abc","Names":"app1","Image":"img1","Status":"Up","State":"running","Ports":"80","CreatedAt":"2024"}',
          'not-json',
          '{"ID":"def","Names":"app2","Image":"img2","Status":"Exited","State":"exited","Ports":"","CreatedAt":"2024"}',
        ].join('\n'),
        stderr: '',
        exitCode: 0,
      });
      const result = await listContainers();
      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('abc');
      expect(result[1]?.name).toBe('app2');
    });

    it('JSON 字段缺失时用空字符串兜底', async () => {
      mockExecuteCommand.mockResolvedValue({
        stdout: '{}',
        stderr: '',
        exitCode: 0,
      });
      const result = await listContainers();
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('');
      expect(result[0]?.name).toBe('');
    });
  });

  describe('getContainerLogs', () => {
    it('无 since 参数', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: 'log', stderr: '', exitCode: 0 });
      const result = await getContainerLogs('app', 50);
      expect(result.stdout).toBe('log');
      const args = mockExecuteCommand.mock.calls[0][1] as string[];
      expect(args).not.toContain('--since');
    });

    it('有 since 参数', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: 'log', stderr: '', exitCode: 0 });
      await getContainerLogs('app', 50, '2024-01-01T00:00:00');
      const args = mockExecuteCommand.mock.calls[0][1] as string[];
      expect(args).toContain('--since');
      expect(args).toContain('2024-01-01T00:00:00');
    });
  });

  describe('isDockerAvailable', () => {
    it('exitCode=0 返回 true', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '24.0', stderr: '', exitCode: 0 });
      expect(await isDockerAvailable()).toBe(true);
    });

    it('exitCode!=0 返回 false', async () => {
      mockExecuteCommand.mockResolvedValue({ stdout: '', stderr: 'err', exitCode: 1 });
      expect(await isDockerAvailable()).toBe(false);
    });
  });
});
