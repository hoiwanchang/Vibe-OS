/**
 * 模块：共享文件夹 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn().mockResolvedValue(undefined);
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));
const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));
vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../sharing.service.js';
import { AppError } from '../../../common/app-error.js';

describe('共享文件夹', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('listShares', () => {
    it('应返回已保存的共享', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'test', path: '/data/1000/files', protocol: 'smb', readonly: false, validUsers: [], hosts: [], enabled: true }]));
      const shares = await service.listShares();
      expect(shares).toHaveLength(1);
      expect(shares[0]?.name).toBe('test');
    });

    it('无配置应返回空', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const shares = await service.listShares();
      expect(shares).toEqual([]);
    });
  });

  describe('createShare', () => {
    it('应创建 SMB 共享', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const share = await service.createShare({ name: 'docs', path: '/data/1000/files', protocol: 'smb', readonly: false, validUsers: [], hosts: [] });
      expect(share.name).toBe('docs');
      expect(share.enabled).toBe(true);
      expect(mockExecuteCommand).toHaveBeenCalledWith('smbcontrol', ['smbd', 'reload-config']);
    });

    it('重复名称应冲突', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'docs', path: '/data/x', protocol: 'smb', readonly: false, validUsers: [], hosts: [], enabled: true }]));
      await expect(service.createShare({ name: 'docs', path: '/data/y', protocol: 'smb', readonly: false, validUsers: [], hosts: [] })).rejects.toThrow(AppError);
    });

    it('路径不在 /data/ 下应拒绝', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      await expect(service.createShare({ name: 'bad', path: '/etc/passwd', protocol: 'smb', readonly: false, validUsers: [], hosts: [] })).rejects.toThrow(AppError);
    });
  });

  describe('removeShare', () => {
    it('应删除共享', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ name: 'docs', path: '/data/x', protocol: 'nfs', readonly: false, validUsers: [], hosts: [], enabled: true }]));
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const removed = await service.removeShare('docs');
      expect(removed).toBe('docs');
    });

    it('不存在应 404', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));
      await expect(service.removeShare('nope')).rejects.toThrow(AppError);
    });
  });
});
