/**
 * 系统层：docker 扩展测试
 * 覆盖 restartContainer, stopContainer, removeContainer
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

import { restartContainer, stopContainer, removeContainer } from '../docker.js';

describe('docker 扩展', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('restartContainer', () => {
    it('应调用 docker restart', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await restartContainer('ollama');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('docker', ['restart', 'ollama']);
    });
  });

  describe('stopContainer', () => {
    it('应调用 docker stop', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await stopContainer('ollama');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('docker', ['stop', 'ollama']);
    });
  });

  describe('removeContainer', () => {
    it('应调用 docker rm', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await removeContainer('ollama');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('docker', ['rm', 'ollama']);
    });

    it('force 模式应加 -f 参数', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      await removeContainer('ollama', true);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('docker', ['rm', '-f', 'ollama']);
    });
  });
});
