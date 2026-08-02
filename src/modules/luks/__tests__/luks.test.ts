/**
 * 模块：LUKS 卷加密 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue('');
const mockUnlink = vi.fn().mockResolvedValue(undefined);
const mockAccess = vi.fn().mockResolvedValue(undefined);
const mockReaddir = vi.fn().mockResolvedValue([]);
vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  access: (...args: unknown[]) => mockAccess(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
}));

vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  SECRETS_DIR: '/data/vibeos/secrets',
  COMMAND_TIMEOUT_MS: 5000,
}));

vi.mock('../../../system/filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

import * as service from '../luks.service.js';
import { AppError } from '../../../common/app-error.js';

describe('LUKS 卷加密', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue('');
    mockAccess.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
  });

  // ===== 创建卷 =====
  describe('createVolume', () => {
    it('应使用 passphrase 创建 LUKS2 卷', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const result = await service.createVolume('/dev/sdb', 'my-secret');
      expect(result).toEqual({ device: '/dev/sdb', type: 'luks2' });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith(
        'cryptsetup',
        expect.arrayContaining(['luksFormat', '--type', 'luks2', '--batch-mode', '--key-file']),
        300_000,
      );
    });

    it('应使用 keyfile 创建卷', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const result = await service.createVolume('/dev/sdc', undefined, '/data/vibeos/secrets/luks/data.key');
      expect(result).toEqual({ device: '/dev/sdc', type: 'luks2' });
      const callArgs = mockExecuteCommandStrict.mock.calls[0]?.[1] as string[];
      expect(callArgs).toContain('--key-file');
      expect(callArgs).toContain('/data/vibeos/secrets/luks/data.key');
    });

    it('passphrase 和 keyfile 都未提供应抛出错误', async () => {
      await expect(service.createVolume('/dev/sdb')).rejects.toThrow(AppError);
    });

    it('passphrase 应写入临时文件并在执行后清理', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      await service.createVolume('/dev/sdb', 'secret123');
      // 临时文件写入
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('/run/vibeos-luks/tmp-'),
        'secret123',
        expect.objectContaining({ mode: 0o600 }),
      );
      // 清理
      expect(mockUnlink).toHaveBeenCalled();
    });

    it('cryptsetup 失败后仍应清理临时文件', async () => {
      mockExecuteCommandStrict.mockRejectedValue(AppError.commandFailed('cryptsetup', 'fail'));
      await expect(service.createVolume('/dev/sdb', 'secret')).rejects.toThrow();
      expect(mockUnlink).toHaveBeenCalled();
    });
  });

  // ===== 解锁卷 =====
  describe('openVolume', () => {
    it('应使用 passphrase 解锁卷', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const result = await service.openVolume('/dev/sdb', 'data-vol', 'pass123');
      expect(result).toEqual({
        name: 'data-vol',
        device: '/dev/sdb',
        mapperPath: '/dev/mapper/data-vol',
      });
      const callArgs = mockExecuteCommandStrict.mock.calls[0]?.[1] as string[];
      expect(callArgs).toContain('open');
      expect(callArgs).toContain('data-vol');
    });

    it('应使用 keyfile 解锁卷', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const result = await service.openVolume('/dev/sdb', 'vol1', undefined, '/keys/vol1.key');
      expect(result.mapperPath).toBe('/dev/mapper/vol1');
      const callArgs = mockExecuteCommandStrict.mock.calls[0]?.[1] as string[];
      expect(callArgs).toContain('/keys/vol1.key');
    });

    it('无凭据应抛出错误', async () => {
      await expect(service.openVolume('/dev/sdb', 'vol1')).rejects.toThrow(AppError);
    });
  });

  // ===== 锁定卷 =====
  describe('closeVolume', () => {
    it('应关闭卷映射', async () => {
      mockExecuteCommandStrict.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const result = await service.closeVolume('data-vol');
      expect(result).toEqual({ name: 'data-vol', closed: true });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('cryptsetup', ['close', 'data-vol']);
    });

    it('cryptsetup 失败应抛出错误', async () => {
      mockExecuteCommandStrict.mockRejectedValue(AppError.commandFailed('cryptsetup', 'busy'));
      await expect(service.closeVolume('busy-vol')).rejects.toThrow();
    });
  });

  // ===== 状态查询 =====
  describe('getVolumeStatus', () => {
    const STATUS_OUTPUT = [
      '/dev/mapper/data-vol is active.',
      '  type:    LUKS2',
      '  cipher:  aes-xts-plain64',
      '  keysize: 512 bits',
      '  device:  /dev/sdb',
      '  mode:    read/write',
      '  offset:  32768 sectors',
      '  size:    1953525168 sectors',
    ].join('\n');

    it('应解析 cryptsetup status 输出', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: STATUS_OUTPUT, stderr: '' });
      const status = await service.getVolumeStatus('data-vol');
      expect(status).not.toBeNull();
      expect(status?.name).toBe('data-vol');
      expect(status?.active).toBe(true);
      expect(status?.type).toBe('LUKS2');
      expect(status?.cipher).toBe('aes-xts-plain64');
      expect(status?.keysize).toBe('512 bits');
      expect(status?.device).toBe('/dev/sdb');
      expect(status?.mode).toBe('read/write');
    });

    it('卷不存在应返回 null', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 4, stdout: '', stderr: 'not found' });
      const status = await service.getVolumeStatus('nonexist');
      expect(status).toBeNull();
    });
  });

  describe('listStatus', () => {
    it('应遍历 /dev/mapper 并返回卷列表', async () => {
      mockReaddir.mockResolvedValue(['control', 'data-vol', 'backup-vol']);
      mockExecuteCommand.mockImplementation((_cmd: string, args: string[]) => {
        const name = args[1] as string;
        return Promise.resolve({
          exitCode: 0,
          stdout: `/dev/mapper/${name} is active.\n  type:    LUKS2\n  cipher:  aes-xts-plain64\n  keysize: 512 bits\n  device:  /dev/sdb\n  mode:    read/write\n  offset:  0\n  size:  100`,
          stderr: '',
        });
      });
      const volumes = await service.listStatus();
      // control 应被跳过
      expect(volumes).toHaveLength(2);
      expect(volumes[0]?.name).toBe('data-vol');
      expect(volumes[1]?.name).toBe('backup-vol');
    });

    it('/dev/mapper 不存在应返回空数组', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT'));
      const volumes = await service.listStatus();
      expect(volumes).toEqual([]);
    });
  });

  // ===== keyfile 生成 =====
  describe('generateKeyfile', () => {
    it('应生成 64 字节 keyfile 并设置 0600 权限', async () => {
      const result = await service.generateKeyfile('data-vol');
      expect(result.name).toBe('data-vol');
      expect(result.path).toBe('/data/vibeos/secrets/luks/data-vol.key');
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/data/vibeos/secrets/luks/data-vol.key',
        expect.any(Buffer),
        expect.objectContaining({ mode: 0o600 }),
      );
      // 验证写入的数据为 64 字节
      const writtenData = mockWriteFile.mock.calls[0]?.[1] as Buffer;
      expect(writtenData.length).toBe(64);
    });
  });

  // ===== 自动解锁 =====
  describe('configureAutounlock', () => {
    it('应在空 crypttab 中追加条目', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      const result = await service.configureAutounlock('data-vol', '/dev/sdb');
      expect(result).toEqual({
        name: 'data-vol',
        device: '/dev/sdb',
        keyfile: '/data/vibeos/secrets/luks/data-vol.key',
      });
      const written = mockWriteFile.mock.calls[0]?.[1] as string;
      expect(written).toContain('data-vol /dev/sdb /data/vibeos/secrets/luks/data-vol.key luks,discard');
    });

    it('应更新已存在的同名条目', async () => {
      mockReadFile.mockResolvedValue('# comment\nold-vol /dev/sdc /old.key luks\ndata-vol /dev/sda /old-data.key luks\n');
      await service.configureAutounlock('data-vol', '/dev/sdb');
      const written = mockWriteFile.mock.calls[0]?.[1] as string;
      // 旧条目被替换
      expect(written).not.toContain('/old-data.key');
      expect(written).toContain('data-vol /dev/sdb /data/vibeos/secrets/luks/data-vol.key luks,discard');
      // 其他条目保留
      expect(written).toContain('old-vol /dev/sdc /old.key luks');
    });

    it('应使用自定义 keyfile 路径', async () => {
      mockReadFile.mockResolvedValue('');
      const result = await service.configureAutounlock('vol1', '/dev/sdc', '/custom/key.bin');
      expect(result.keyfile).toBe('/custom/key.bin');
      const written = mockWriteFile.mock.calls[0]?.[1] as string;
      expect(written).toContain('/custom/key.bin');
    });

    it('密钥文件不存在应抛出 404', async () => {
      mockAccess.mockRejectedValue(new Error('ENOENT'));
      await expect(service.configureAutounlock('vol1', '/dev/sdb')).rejects.toThrow(AppError);
    });
  });
});
