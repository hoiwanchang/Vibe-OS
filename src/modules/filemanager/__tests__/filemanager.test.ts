/**
 * 模块：文件管理器 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises');
vi.mock('node:fs', () => ({
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(),
}));
vi.mock('node:stream/promises', () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('mime-types', () => ({
  lookup: vi.fn().mockReturnValue('text/plain'),
}));
vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  NAISYS_APP_DIR: '/data/naisys',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../filemanager.service.js';
import { AppError } from '../../../common/app-error.js';

describe('文件管理器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveUserPath', () => {
    it('应正确解析用户空间内路径', () => {
      const result = service.resolveUserPath(1000, 'files/doc.txt');
      expect(result).toBe('/data/1000/files/doc.txt');
    });

    it('空路径应返回用户根目录', () => {
      const result = service.resolveUserPath(1000, '');
      expect(result).toBe('/data/1000');
    });

    it('路径穿越应抛出 403', () => {
      expect(() => service.resolveUserPath(1000, '../../etc/passwd')).toThrow(AppError);
    });

    it('绝对路径穿越应抛出 403', () => {
      expect(() => service.resolveUserPath(1000, '/etc/shadow')).toThrow(AppError);
    });

    it('访问其他用户目录应抛出 403', () => {
      expect(() => service.resolveUserPath(1000, '../2000/files')).toThrow(AppError);
    });
  });

  describe('listDir', () => {
    it('应返回目录内容', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as fs.Stats);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'test.txt', isSymbolicLink: () => false, isDirectory: () => false },
        { name: 'subdir', isSymbolicLink: () => false, isDirectory: () => true },
      ] as unknown as fs.Dirent[]);
      vi.mocked(fs.lstat).mockResolvedValue({
        size: 1024,
        mtime: new Date('2024-01-01'),
        mode: 0o644,
      } as fs.Stats);

      const result = await service.listDir(1000, 'files');
      expect(result.total).toBe(2);
      expect(result.entries[0]?.name).toBe('test.txt');
      expect(result.entries[1]?.type).toBe('directory');
    });

    it('目录不存在应抛出 404', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
      await expect(service.listDir(1000, 'nonexistent')).rejects.toThrow(AppError);
    });
  });

  describe('readFile', () => {
    it('应读取文件内容', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 100, isDirectory: () => false } as fs.Stats);
      const mockFh = { read: vi.fn().mockResolvedValue({}), close: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(fs.open).mockResolvedValue(mockFh as unknown as fs.FileHandle);

      const result = await service.readFile(1000, 'files/test.txt');
      expect(result.size).toBe(100);
      expect(result.truncated).toBe(false);
    });

    it('大文件应标记截断', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 2 * 1024 * 1024, isDirectory: () => false } as fs.Stats);
      const mockFh = { read: vi.fn().mockResolvedValue({}), close: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(fs.open).mockResolvedValue(mockFh as unknown as fs.FileHandle);

      const result = await service.readFile(1000, 'files/big.txt');
      expect(result.truncated).toBe(true);
    });

    it('读取目录应抛出 400', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 0, isDirectory: () => true } as fs.Stats);
      await expect(service.readFile(1000, 'files')).rejects.toThrow('是目录');
    });
  });

  describe('mkdir', () => {
    it('应创建目录', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const result = await service.mkdir(1000, 'files/newdir');
      expect(result).toBe('files/newdir');
      expect(fs.mkdir).toHaveBeenCalledWith('/data/1000/files/newdir', { recursive: true });
    });
  });

  describe('writeFile', () => {
    it('应写入文件', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({ size: 12 } as fs.Stats);

      const result = await service.writeFile(1000, 'files/test.txt', 'hello world!');
      expect(result.written).toBe('files/test.txt');
      expect(result.size).toBe(12);
    });
  });

  describe('deleteFile', () => {
    it('永久删除应调用 rm', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      const result = await service.deleteFile(1000, 'files/old.txt', true);
      expect(result.method).toBe('permanent');
      expect(fs.rm).toHaveBeenCalled();
    });

    it('默认应移入回收站', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const result = await service.deleteFile(1000, 'files/old.txt', false);
      expect(result.method).toBe('trash');
      expect(fs.rename).toHaveBeenCalled();
    });

    it('文件不存在应抛出 404', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      await expect(service.deleteFile(1000, 'nope.txt', true)).rejects.toThrow(AppError);
    });
  });

  describe('copyFile', () => {
    it('应复制文件', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.cp).mockResolvedValue(undefined);

      const result = await service.copyFile(1000, 'files/a.txt', 'files/b.txt');
      expect(result.copied).toBe('files/a.txt');
      expect(result.dest).toBe('files/b.txt');
    });
  });

  describe('rename', () => {
    it('应重命名文件', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const result = await service.rename(1000, 'files/old.txt', 'new.txt');
      expect(result.from).toBe('files/old.txt');
      expect(result.to).toBe('files/new.txt');
    });
  });

  describe('listTrash', () => {
    it('回收站不存在应返回空', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      const result = await service.listTrash(1000);
      expect(result.total).toBe(0);
    });
  });

  describe('emptyTrash', () => {
    it('应清空并重建回收站', async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      await service.emptyTrash(1000);
      expect(fs.rm).toHaveBeenCalled();
      expect(fs.mkdir).toHaveBeenCalled();
    });
  });

  describe('getDownloadInfo', () => {
    it('应返回文件下载信息', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 2048, isDirectory: () => false } as fs.Stats);
      const info = await service.getDownloadInfo(1000, 'files/doc.pdf');
      expect(info.filename).toBe('doc.pdf');
      expect(info.size).toBe(2048);
    });

    it('下载目录应抛出 400', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 0, isDirectory: () => true } as fs.Stats);
      await expect(service.getDownloadInfo(1000, 'files')).rejects.toThrow('不能下载目录');
    });
  });
});
