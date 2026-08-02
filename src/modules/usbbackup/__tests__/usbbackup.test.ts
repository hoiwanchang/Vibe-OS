/**
 * 模块：USB 外设备份 — 单元测试
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
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommand(...args),
}));

vi.mock('../../../system/filesystem.js', () => ({
  ensureDir: vi.fn().mockResolvedValue(undefined),
  assertSafePath: (p: string) => p,
  assertSafePathReal: (p: string) => Promise.resolve(p),
  pathExists: () => Promise.resolve(true),
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
  API_TOKEN: '',
  SSH_TARGET_USER: 'vibeuser',
  SSH_AUTHORIZED_KEYS_FILE: '',
  DEFAULT_QUOTA_BYTES: BigInt(100 * 1024 * 1024 * 1024),
  USER_SUBDIRS: ['files', 'config', 'cache'],
  APP_SUBDIRS: ['models', 'data', 'logs'],
  ADMIN_PASSWORD: 'vibeos',
  SESSION_TTL_MS: 86400000,
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCK_MS: 900000,
  OIDC_ISSUER: 'http://127.0.0.1:3000',
  ACCESS_TOKEN_TTL_S: 3600,
  REFRESH_TOKEN_TTL_MS: 2592000000,
  AUTH_CODE_TTL_MS: 600000,
  SESSION_COOKIE_NAME: 'vibeos.sid',
  IS_PRODUCTION: false,
  FORCE_2FA: false,
}));

import { createApp } from '../../../app.js';

/** 模拟 lsblk -J 输出（含 USB 和非 USB 设备） */
const LSBLK_OUTPUT = JSON.stringify({
  blockdevices: [
    {
      name: 'sda',
      label: null,
      size: '500G',
      type: 'disk',
      mountpoint: null,
      fstype: null,
      model: 'Samsung SSD',
      vendor: 'ATA',
      tran: 'sata',
      children: [
        {
          name: 'sda1',
          label: 'root',
          size: '500G',
          type: 'part',
          mountpoint: '/',
          fstype: 'ext4',
          model: null,
          vendor: null,
          tran: null,
        },
      ],
    },
    {
      name: 'sdb',
      label: 'USB-DRIVE',
      size: '32G',
      type: 'disk',
      mountpoint: null,
      fstype: null,
      model: 'Flash Disk',
      vendor: 'SanDisk',
      tran: 'usb',
      children: [
        {
          name: 'sdb1',
          label: 'BACKUP',
          size: '32G',
          type: 'part',
          mountpoint: '/media/usb0',
          fstype: 'vfat',
          model: null,
          vendor: null,
          tran: null,
        },
      ],
    },
  ],
});

/** 模拟 rsync --stats 输出 */
const RSYNC_STATS = `Number of files: 1,024
Number of regular files transferred: 42
Total file size: 1,048,576 bytes
Total transferred file size: 524,288 bytes
`;

describe('USB 外设备份 API', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  });

  // ===== GET /api/usbbackup/devices =====

  describe('GET /api/usbbackup/devices', () => {
    it('应仅返回 USB 设备', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: LSBLK_OUTPUT,
        stderr: '',
      });

      const res = await request(app).get('/api/usbbackup/devices');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.devices).toHaveLength(1);
      expect(res.body.data.devices[0].name).toBe('sdb');
      expect(res.body.data.devices[0].tran).toBe('usb');
      expect(res.body.data.devices[0].label).toBe('USB-DRIVE');
      expect(res.body.data.devices[0].children).toHaveLength(1);
      expect(res.body.data.devices[0].children[0].mountpoint).toBe('/media/usb0');
    });

    it('无 USB 设备应返回空数组', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({
          blockdevices: [
            { name: 'sda', tran: 'sata', type: 'disk', children: [] },
          ],
        }),
        stderr: '',
      });

      const res = await request(app).get('/api/usbbackup/devices');
      expect(res.status).toBe(200);
      expect(res.body.data.devices).toEqual([]);
    });

    it('lsblk 失败应返回 500', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'lsblk: command not found',
      });

      const res = await request(app).get('/api/usbbackup/devices');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('lsblk 输出非法 JSON 应返回 500', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'not-json{{{',
        stderr: '',
      });

      const res = await request(app).get('/api/usbbackup/devices');
      expect(res.status).toBe(500);
    });
  });

  // ===== GET /api/usbbackup/config =====

  describe('GET /api/usbbackup/config', () => {
    it('无配置文件应返回默认值', async () => {
      const res = await request(app).get('/api/usbbackup/config');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.strategy).toBe('rsync');
      expect(res.body.data.sourcePath).toBe('/data');
      expect(res.body.data.targetPath).toBe('');
      expect(res.body.data.autoBackup).toBe(false);
      expect(res.body.data.excludePatterns).toEqual([]);
    });

    it('有配置文件应返回配置', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(
            JSON.stringify({
              strategy: 'copy',
              sourcePath: '/data/photos',
              targetPath: '/media/usb0/backup',
              autoBackup: true,
              excludePatterns: ['*.tmp'],
            }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/usbbackup/config');
      expect(res.status).toBe(200);
      expect(res.body.data.strategy).toBe('copy');
      expect(res.body.data.sourcePath).toBe('/data/photos');
      expect(res.body.data.autoBackup).toBe(true);
      expect(res.body.data.excludePatterns).toEqual(['*.tmp']);
    });

    it('配置文件损坏应返回默认值', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve('{{invalid');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/usbbackup/config');
      expect(res.status).toBe(200);
      expect(res.body.data.strategy).toBe('rsync');
    });

    it('无效策略字段应回退默认值', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({ strategy: 'invalid' }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/usbbackup/config');
      expect(res.status).toBe(200);
      expect(res.body.data.strategy).toBe('rsync');
    });
  });

  // ===== PUT /api/usbbackup/config =====

  describe('PUT /api/usbbackup/config', () => {
    it('应更新配置', async () => {
      const res = await request(app)
        .put('/api/usbbackup/config')
        .send({
          strategy: 'bidirectional',
          sourcePath: '/data/docs',
          targetPath: '/media/usb0/docs',
          autoBackup: true,
          excludePatterns: ['*.log', 'cache/'],
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.strategy).toBe('bidirectional');
      expect(res.body.data.sourcePath).toBe('/data/docs');
      expect(res.body.data.autoBackup).toBe(true);
      expect(res.body.data.excludePatterns).toEqual(['*.log', 'cache/']);
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('部分更新应保留其余字段', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(
            JSON.stringify({
              strategy: 'copy',
              sourcePath: '/data/photos',
              targetPath: '/media/usb0',
              autoBackup: true,
              excludePatterns: ['*.tmp'],
            }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app)
        .put('/api/usbbackup/config')
        .send({ strategy: 'rsync' });
      expect(res.status).toBe(200);
      expect(res.body.data.strategy).toBe('rsync');
      expect(res.body.data.sourcePath).toBe('/data/photos');
      expect(res.body.data.autoBackup).toBe(true);
    });

    it('无效策略应 400', async () => {
      const res = await request(app)
        .put('/api/usbbackup/config')
        .send({ strategy: 'mirror' });
      expect(res.status).toBe(400);
    });

    it('空 sourcePath 应 400', async () => {
      const res = await request(app)
        .put('/api/usbbackup/config')
        .send({ sourcePath: '' });
      expect(res.status).toBe(400);
    });
  });

  // ===== POST /api/usbbackup/execute =====

  describe('POST /api/usbbackup/execute', () => {
    it('rsync 策略应成功执行', async () => {
      // 无正在运行的任务
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      // 配置
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(
            JSON.stringify({
              strategy: 'rsync',
              sourcePath: '/data',
              targetPath: '/media/usb0',
              autoBackup: false,
              excludePatterns: [],
            }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: RSYNC_STATS,
        stderr: '',
      });

      const res = await request(app).post('/api/usbbackup/execute').send({});
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.task.status).toBe('success');
      expect(res.body.data.task.filesTransferred).toBe(42);
      expect(res.body.data.task.bytesTransferred).toBe(524288);
      expect(res.body.data.task.strategy).toBe('rsync');
    });

    it('请求中覆盖策略应生效', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(
            JSON.stringify({
              strategy: 'rsync',
              sourcePath: '/data',
              targetPath: '/media/usb0',
              autoBackup: false,
              excludePatterns: [],
            }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: RSYNC_STATS,
        stderr: '',
      });

      const res = await request(app)
        .post('/api/usbbackup/execute')
        .send({ strategy: 'copy' });
      expect(res.status).toBe(200);
      expect(res.body.data.task.strategy).toBe('copy');
    });

    it('双向同步应执行两次 rsync', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(
            JSON.stringify({
              strategy: 'bidirectional',
              sourcePath: '/data',
              targetPath: '/media/usb0',
              autoBackup: false,
              excludePatterns: [],
            }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: RSYNC_STATS,
        stderr: '',
      });

      const res = await request(app).post('/api/usbbackup/execute').send({});
      expect(res.status).toBe(200);
      expect(res.body.data.task.status).toBe('success');
      // 双向同步：两次 rsync 的统计相加
      expect(res.body.data.task.filesTransferred).toBe(84);
      expect(res.body.data.task.bytesTransferred).toBe(1048576);
      // executeCommand 应被调用 2 次（正向 + 反向）
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    });

    it('rsync 失败应记录错误', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(
            JSON.stringify({
              strategy: 'rsync',
              sourcePath: '/data',
              targetPath: '/media/usb0',
              autoBackup: false,
              excludePatterns: [],
            }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      mockExecuteCommand.mockResolvedValue({
        exitCode: 23,
        stdout: '',
        stderr: 'rsync: some files could not be transferred',
      });

      const res = await request(app).post('/api/usbbackup/execute').send({});
      expect(res.status).toBe(200);
      expect(res.body.data.task.status).toBe('failed');
      expect(res.body.data.task.error).toContain('rsync');
    });

    it('目标路径为空应 400', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('config.json')) {
          return Promise.resolve(
            JSON.stringify({
              strategy: 'rsync',
              sourcePath: '/data',
              targetPath: '',
              autoBackup: false,
              excludePatterns: [],
            }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).post('/api/usbbackup/execute').send({});
      expect(res.status).toBe(400);
    });

    it('有正在运行的任务应 409', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('task.json')) {
          return Promise.resolve(
            JSON.stringify({
              id: 'running-task',
              strategy: 'rsync',
              source: '/data',
              target: '/media/usb0',
              status: 'running',
              startedAt: '2026-01-01T00:00:00.000Z',
              finishedAt: null,
              filesTransferred: 0,
              bytesTransferred: 0,
              error: null,
            }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).post('/api/usbbackup/execute').send({});
      expect(res.status).toBe(409);
    });

    it('无效策略应 400', async () => {
      const res = await request(app)
        .post('/api/usbbackup/execute')
        .send({ strategy: 'mirror' });
      expect(res.status).toBe(400);
    });
  });

  // ===== GET /api/usbbackup/status =====

  describe('GET /api/usbbackup/status', () => {
    it('无任务应返回 idle', async () => {
      const res = await request(app).get('/api/usbbackup/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.task).toBeNull();
      expect(res.body.data.running).toBe(false);
    });

    it('有运行中任务应返回 running', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('task.json')) {
          return Promise.resolve(
            JSON.stringify({
              id: 'task-1',
              strategy: 'rsync',
              source: '/data',
              target: '/media/usb0',
              status: 'running',
              startedAt: '2026-01-01T00:00:00.000Z',
              finishedAt: null,
              filesTransferred: 0,
              bytesTransferred: 0,
              error: null,
            }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/usbbackup/status');
      expect(res.status).toBe(200);
      expect(res.body.data.running).toBe(true);
      expect(res.body.data.task.status).toBe('running');
    });

    it('已完成任务应返回非 running', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('task.json')) {
          return Promise.resolve(
            JSON.stringify({
              id: 'task-2',
              strategy: 'copy',
              source: '/data',
              target: '/media/usb0',
              status: 'success',
              startedAt: '2026-01-01T00:00:00.000Z',
              finishedAt: '2026-01-01T00:05:00.000Z',
              filesTransferred: 10,
              bytesTransferred: 1024,
              error: null,
            }),
          );
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/usbbackup/status');
      expect(res.status).toBe(200);
      expect(res.body.data.running).toBe(false);
      expect(res.body.data.task.status).toBe('success');
    });
  });

  // ===== GET /api/usbbackup/history =====

  describe('GET /api/usbbackup/history', () => {
    it('无历史应返回空数组', async () => {
      const res = await request(app).get('/api/usbbackup/history');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.history).toEqual([]);
    });

    it('有历史应返回记录列表', async () => {
      const entries = [
        {
          id: 'h1',
          strategy: 'rsync',
          source: '/data',
          target: '/media/usb0',
          status: 'success',
          startedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:05:00.000Z',
          filesTransferred: 42,
          bytesTransferred: 524288,
          error: null,
        },
        {
          id: 'h2',
          strategy: 'copy',
          source: '/data',
          target: '/media/usb0',
          status: 'failed',
          startedAt: '2026-01-02T00:00:00.000Z',
          finishedAt: '2026-01-02T00:01:00.000Z',
          filesTransferred: 0,
          bytesTransferred: 0,
          error: 'rsync failed',
        },
      ];
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('history.json')) {
          return Promise.resolve(JSON.stringify(entries));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/usbbackup/history');
      expect(res.status).toBe(200);
      expect(res.body.data.history).toHaveLength(2);
      expect(res.body.data.history[0].id).toBe('h1');
      expect(res.body.data.history[1].status).toBe('failed');
    });

    it('历史文件损坏应返回空数组', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('history.json')) {
          return Promise.resolve('{{invalid');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/usbbackup/history');
      expect(res.status).toBe(200);
      expect(res.body.data.history).toEqual([]);
    });

    it('历史文件非数组应返回空数组', async () => {
      mockReadFile.mockImplementation((filePath: string) => {
        if (filePath.includes('history.json')) {
          return Promise.resolve(JSON.stringify({ not: 'array' }));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const res = await request(app).get('/api/usbbackup/history');
      expect(res.status).toBe(200);
      expect(res.body.data.history).toEqual([]);
    });
  });
});
