/**
 * 模块：回收站策略 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn().mockResolvedValue(undefined);

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

const mockExecuteCommand = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
}));

vi.mock('../../../system/filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  SECRETS_DIR: '/data/vibeos/secrets',
  SYSTEM_CACHE_DIR: '/data/vibeos/cache',
  PORT: 3000,
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  LOG_LEVEL: 'info',
  COMMAND_TIMEOUT_MS: 5000,
  AUTH_DISABLED: true,
}));

import { createApp } from '../../../app.js';

/** 模拟 find 输出（size\ttime\tpath） */
const FIND_OUTPUT = `1024\t1700000000\t/data/.recyclebin/docs/report.pdf
2048\t1700001000\t/data/.recyclebin/docs/notes.txt
`;

/** 模拟 du 输出 */
const DU_OUTPUT = '3072\t/data/.recyclebin/docs\n';

/** 默认共享文件夹配置 */
const DEFAULT_SHARES = [
  {
    shareName: 'docs',
    enabled: true,
    retentionDays: 30,
    maxSizeBytes: 1073741824,
    excludeExtensions: ['.tmp'],
    excludePaths: ['cache/'],
  },
];

describe('回收站策略 API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  });

  // ===== GET /api/recyclebin/config =====

  describe('GET /api/recyclebin/config', () => {
    it('无配置文件应返回默认空配置', async () => {
      const res = await request(app).get('/api/recyclebin/config');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shares).toEqual([]);
    });

    it('有配置文件应返回配置', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/recyclebin/config');
      expect(res.status).toBe(200);
      expect(res.body.data.shares).toHaveLength(1);
      expect(res.body.data.shares[0].shareName).toBe('docs');
      expect(res.body.data.shares[0].enabled).toBe(true);
      expect(res.body.data.shares[0].retentionDays).toBe(30);
      expect(res.body.data.shares[0].maxSizeBytes).toBe(1073741824);
      expect(res.body.data.shares[0].excludeExtensions).toEqual(['.tmp']);
      expect(res.body.data.shares[0].excludePaths).toEqual(['cache/']);
    });

    it('配置文件损坏应返回默认值', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve('not-json{{{');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/recyclebin/config');
      expect(res.status).toBe(200);
      expect(res.body.data.shares).toEqual([]);
    });

    it('配置缺少 shares 字段应返回默认值', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ notShares: true }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/recyclebin/config');
      expect(res.status).toBe(200);
      expect(res.body.data.shares).toEqual([]);
    });

    it('配置字段缺失应使用默认值', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(
            JSON.stringify({ shares: [{ shareName: 'test' }] }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/recyclebin/config');
      expect(res.status).toBe(200);
      expect(res.body.data.shares[0].enabled).toBe(false);
      expect(res.body.data.shares[0].retentionDays).toBe(0);
      expect(res.body.data.shares[0].maxSizeBytes).toBe(0);
      expect(res.body.data.shares[0].excludeExtensions).toEqual([]);
      expect(res.body.data.shares[0].excludePaths).toEqual([]);
    });
  });

  // ===== PUT /api/recyclebin/config =====

  describe('PUT /api/recyclebin/config', () => {
    it('应更新配置', async () => {
      const res = await request(app)
        .put('/api/recyclebin/config')
        .send({ shares: DEFAULT_SHARES });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shares).toHaveLength(1);
      expect(res.body.data.shares[0].shareName).toBe('docs');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('空 shares 数组应成功', async () => {
      const res = await request(app)
        .put('/api/recyclebin/config')
        .send({ shares: [] });
      expect(res.status).toBe(200);
      expect(res.body.data.shares).toEqual([]);
    });

    it('缺少 shareName 应 400', async () => {
      const res = await request(app)
        .put('/api/recyclebin/config')
        .send({
          shares: [{ enabled: true, retentionDays: 0, maxSizeBytes: 0, excludeExtensions: [], excludePaths: [] }],
        });
      expect(res.status).toBe(400);
    });

    it('shareName 为空字符串应 400', async () => {
      const res = await request(app)
        .put('/api/recyclebin/config')
        .send({
          shares: [{ shareName: '', enabled: true, retentionDays: 0, maxSizeBytes: 0, excludeExtensions: [], excludePaths: [] }],
        });
      expect(res.status).toBe(400);
    });

    it('负数 retentionDays 应 400', async () => {
      const res = await request(app)
        .put('/api/recyclebin/config')
        .send({
          shares: [{ shareName: 'docs', enabled: true, retentionDays: -1, maxSizeBytes: 0, excludeExtensions: [], excludePaths: [] }],
        });
      expect(res.status).toBe(400);
    });

    it('负数 maxSizeBytes 应 400', async () => {
      const res = await request(app)
        .put('/api/recyclebin/config')
        .send({
          shares: [{ shareName: 'docs', enabled: true, retentionDays: 0, maxSizeBytes: -100, excludeExtensions: [], excludePaths: [] }],
        });
      expect(res.status).toBe(400);
    });

    it('缺少 shares 字段应 400', async () => {
      const res = await request(app)
        .put('/api/recyclebin/config')
        .send({});
      expect(res.status).toBe(400);
    });

    it('非整数 retentionDays 应 400', async () => {
      const res = await request(app)
        .put('/api/recyclebin/config')
        .send({
          shares: [{ shareName: 'docs', enabled: true, retentionDays: 1.5, maxSizeBytes: 0, excludeExtensions: [], excludePaths: [] }],
        });
      expect(res.status).toBe(400);
    });
  });

  // ===== GET /api/recyclebin/files =====

  describe('GET /api/recyclebin/files', () => {
    it('无启用共享文件夹应返回空列表', async () => {
      const res = await request(app).get('/api/recyclebin/files');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.files).toEqual([]);
    });

    it('有启用共享文件夹应返回文件列表', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: FIND_OUTPUT,
        stderr: '',
      });

      const res = await request(app).get('/api/recyclebin/files');
      expect(res.status).toBe(200);
      expect(res.body.data.files).toHaveLength(2);
      expect(res.body.data.files[0].shareName).toBe('docs');
      expect(res.body.data.files[0].sizeBytes).toBe(1024);
      expect(res.body.data.files[0].originalPath).toContain('docs');
      expect(res.body.data.files[0].id).toBeTruthy();
    });

    it('按共享文件夹过滤', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: FIND_OUTPUT,
        stderr: '',
      });

      const res = await request(app).get('/api/recyclebin/files?share=docs');
      expect(res.status).toBe(200);
      expect(res.body.data.files).toHaveLength(2);
    });

    it('查询不存在的共享文件夹应 404', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/recyclebin/files?share=nonexistent');
      expect(res.status).toBe(404);
    });

    it('find 命令失败应返回空列表', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'No such file',
      });

      const res = await request(app).get('/api/recyclebin/files');
      expect(res.status).toBe(200);
      expect(res.body.data.files).toEqual([]);
    });

    it('禁用的共享文件夹不应出现在列表中', async () => {
      const disabledShares = [
        { ...DEFAULT_SHARES[0], enabled: false },
      ];
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: disabledShares }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/recyclebin/files');
      expect(res.status).toBe(200);
      expect(res.body.data.files).toEqual([]);
    });
  });

  // ===== POST /api/recyclebin/restore/:id =====

  describe('POST /api/recyclebin/restore/:id', () => {
    it('应成功恢复文件', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: FIND_OUTPUT,
        stderr: '',
      });

      // 先获取文件列表以取得有效 ID
      const listRes = await request(app).get('/api/recyclebin/files');
      const fileId = listRes.body.data.files[0].id;

      const res = await request(app).post(`/api/recyclebin/restore/${fileId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.restored).toBe(true);
      expect(res.body.data.restoredPath).toBeTruthy();
    });

    it('恢复不存在的文件应 404', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      const res = await request(app).post('/api/recyclebin/restore/nonexistent-id');
      expect(res.status).toBe(404);
    });

    it('mv 命令失败应返回 500', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      // 按命令名匹配：find 始终返回文件列表，mkdir 成功，mv 失败
      mockExecuteCommand.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === 'find') {
          return Promise.resolve({ exitCode: 0, stdout: FIND_OUTPUT, stderr: '' });
        }
        if (cmd === 'bash' && args?.some((a: string) => a.includes('mkdir'))) {
          return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
        }
        // mv 失败
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'Permission denied' });
      });

      const listRes = await request(app).get('/api/recyclebin/files');
      const fileId = listRes.body.data.files[0].id;

      const res = await request(app).post(`/api/recyclebin/restore/${fileId}`);
      expect(res.status).toBe(500);
    });
  });

  // ===== DELETE /api/recyclebin/empty =====

  describe('DELETE /api/recyclebin/empty', () => {
    it('应清空所有启用共享文件夹的回收站', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: FIND_OUTPUT,
        stderr: '',
      });

      const res = await request(app).delete('/api/recyclebin/empty');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deletedCount).toBe(2);
      expect(res.body.data.freedBytes).toBe(3072);
    });

    it('按共享文件夹清空', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: FIND_OUTPUT,
        stderr: '',
      });

      const res = await request(app).delete('/api/recyclebin/empty?share=docs');
      expect(res.status).toBe(200);
      expect(res.body.data.deletedCount).toBe(2);
    });

    it('清空不存在的共享文件夹应 404', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).delete('/api/recyclebin/empty?share=nonexistent');
      expect(res.status).toBe(404);
    });

    it('无启用共享文件夹应返回零', async () => {
      const res = await request(app).delete('/api/recyclebin/empty');
      expect(res.status).toBe(200);
      expect(res.body.data.deletedCount).toBe(0);
      expect(res.body.data.freedBytes).toBe(0);
    });

    it('空回收站应返回零', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });

      const res = await request(app).delete('/api/recyclebin/empty');
      expect(res.status).toBe(200);
      expect(res.body.data.deletedCount).toBe(0);
      expect(res.body.data.freedBytes).toBe(0);
    });
  });

  // ===== GET /api/recyclebin/stats =====

  describe('GET /api/recyclebin/stats', () => {
    it('无配置应返回零统计', async () => {
      const res = await request(app).get('/api/recyclebin/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalFiles).toBe(0);
      expect(res.body.data.totalSizeBytes).toBe(0);
      expect(res.body.data.perShare).toEqual([]);
    });

    it('有启用共享文件夹应返回统计', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      // du 返回大小，find 返回文件列表
      mockExecuteCommand.mockImplementation((cmd: string) => {
        if (cmd === 'du') {
          return Promise.resolve({ exitCode: 0, stdout: DU_OUTPUT, stderr: '' });
        }
        if (cmd === 'find') {
          return Promise.resolve({
            exitCode: 0,
            stdout: '/data/.recyclebin/docs/report.pdf\n/data/.recyclebin/docs/notes.txt\n',
            stderr: '',
          });
        }
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      });

      const res = await request(app).get('/api/recyclebin/stats');
      expect(res.status).toBe(200);
      expect(res.body.data.totalFiles).toBe(2);
      expect(res.body.data.totalSizeBytes).toBe(3072);
      expect(res.body.data.perShare).toHaveLength(1);
      expect(res.body.data.perShare[0].shareName).toBe('docs');
      expect(res.body.data.perShare[0].enabled).toBe(true);
      expect(res.body.data.perShare[0].fileCount).toBe(2);
      expect(res.body.data.perShare[0].sizeBytes).toBe(3072);
    });

    it('禁用的共享文件夹应显示零统计', async () => {
      const disabledShares = [
        { ...DEFAULT_SHARES[0], enabled: false },
      ];
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: disabledShares }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/recyclebin/stats');
      expect(res.status).toBe(200);
      expect(res.body.data.perShare).toHaveLength(1);
      expect(res.body.data.perShare[0].enabled).toBe(false);
      expect(res.body.data.perShare[0].fileCount).toBe(0);
      expect(res.body.data.perShare[0].sizeBytes).toBe(0);
    });

    it('du 命令失败应返回零大小', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ shares: DEFAULT_SHARES }));
        }
        return Promise.reject(new Error('ENOENT'));
      });
      mockExecuteCommand.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'No such file',
      });

      const res = await request(app).get('/api/recyclebin/stats');
      expect(res.status).toBe(200);
      expect(res.body.data.perShare[0].sizeBytes).toBe(0);
      expect(res.body.data.perShare[0].fileCount).toBe(0);
    });
  });
});
