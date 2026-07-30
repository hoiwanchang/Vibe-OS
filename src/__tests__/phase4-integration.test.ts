/**
 * Phase 4 集成测试 — RAID / LUKS / SSD Cache / iSCSI controller + routes 覆盖
 * 通过 supertest 走完整 HTTP 路径，mock service 层
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

/* ---------- mock service 层 ---------- */

const raidService = vi.hoisted(() => ({
  listArrays: vi.fn().mockResolvedValue([]),
  createArray: vi.fn().mockResolvedValue({ name: 'md0', level: 'raid1', devices: ['/dev/sdb', '/dev/sdc'], spares: [], state: 'online', totalBytes: 2e12, usedBytes: 0, syncProgress: null }),
  getArrayDetail: vi.fn().mockResolvedValue({ name: 'md0', level: 'raid1', devices: ['/dev/sdb', '/dev/sdc'], spares: [], state: 'online', totalBytes: 2e12, usedBytes: 0, syncProgress: null }),
  addDevice: vi.fn().mockResolvedValue({ name: 'md0', level: 'raid1', devices: ['/dev/sdb', '/dev/sdc', '/dev/sdd'], spares: [], state: 'online', totalBytes: 2e12, usedBytes: 0, syncProgress: null }),
  removeDevice: vi.fn().mockResolvedValue({ name: 'md0', level: 'raid1', devices: ['/dev/sdb'], spares: [], state: 'degraded', totalBytes: 2e12, usedBytes: 0, syncProgress: null }),
  rebuildArray: vi.fn().mockResolvedValue({ started: true }),
  deleteArray: vi.fn().mockResolvedValue({ removed: true }),
}));
vi.mock('../modules/storage/raid.service.js', () => raidService);

const luksService = vi.hoisted(() => ({
  createVolume: vi.fn().mockResolvedValue({ name: 'enc0', device: '/dev/sdd', active: false, type: 'LUKS2', cipher: 'aes-xts-plain64', keySize: 512 }),
  openVolume: vi.fn().mockResolvedValue({ opened: true }),
  closeVolume: vi.fn().mockResolvedValue({ closed: true }),
  listStatus: vi.fn().mockResolvedValue([]),
  getVolumeStatus: vi.fn().mockResolvedValue({ name: 'enc0', device: '/dev/sdd', active: true, type: 'LUKS2', cipher: 'aes-xts-plain64', keySize: 512 }),
  generateKeyfile: vi.fn().mockResolvedValue({ path: '/data/vibeos/secrets/luks/enc0.key' }),
  configureAutounlock: vi.fn().mockResolvedValue({ updated: true }),
}));
vi.mock('../modules/luks/luks.service.js', () => luksService);

const ssdCacheService = vi.hoisted(() => ({
  createCache: vi.fn().mockResolvedValue({ name: 'lv_data_cache', ssdDevice: '/dev/nvme0n1', poolDevice: '/dev/vg0/lv_data', mode: 'read', hitRate: 0, temperature: null, lifePercent: null }),
  removeCache: vi.fn().mockResolvedValue({ removed: true }),
  getStatusList: vi.fn().mockResolvedValue([]),
  getCacheDetail: vi.fn().mockResolvedValue({ name: 'lv_data_cache', ssdDevice: '/dev/nvme0n1', poolDevice: '/dev/vg0/lv_data', mode: 'read', hitRate: 85.5, temperature: 42, lifePercent: 98 }),
}));
vi.mock('../modules/ssd-cache/ssd-cache.service.js', () => ssdCacheService);

const iscsiService = vi.hoisted(() => ({
  listTargets: vi.fn().mockResolvedValue([]),
  createTarget: vi.fn().mockResolvedValue({ iqn: 'iqn.2026-07.com.vibeos:storage', luns: [], connections: 0, chapEnabled: false, initiatorWhitelist: [] }),
  deleteTarget: vi.fn().mockResolvedValue({ removed: true }),
  getTargetDetail: vi.fn().mockResolvedValue({ iqn: 'iqn.2026-07.com.vibeos:storage', luns: [{ lunId: 0, backingStore: '/dev/vg0/lv-data', sizeBytes: 107374182400 }], connections: 1, chapEnabled: true, initiatorWhitelist: ['iqn.client1'] }),
  addLun: vi.fn().mockResolvedValue({ lunId: 1, backingStore: '/dev/vg0/lv-extra', sizeBytes: 53687091200 }),
  removeLun: vi.fn().mockResolvedValue({ removed: true }),
}));
vi.mock('../modules/iscsi/iscsi.service.js', () => iscsiService);

/* ---------- mock 系统层（app.ts 依赖） ---------- */
vi.mock('../system/command-executor.js', () => ({
  executeCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
  executeCommandStrict: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
}));
vi.mock('../system/filesystem.js', () => ({
  assertSafePath: vi.fn((p: string) => p),
  assertSafePathReal: vi.fn().mockResolvedValue(undefined),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  resolveInData: vi.fn((p: string) => `/data/${p}`),
}));
vi.mock('../system/disk.js', () => ({
  listBlockDevices: vi.fn().mockResolvedValue([]),
  getDiskSmartInfo: vi.fn().mockResolvedValue(null),
  getAllDiskHealth: vi.fn().mockResolvedValue([]),
}));
vi.mock('../system/network.js', () => ({
  detectNetworkDrivers: vi.fn().mockResolvedValue([]),
  getInterfaceInfo: vi.fn().mockResolvedValue(null),
}));
vi.mock('../system/docker.js', () => ({
  deployContainer: vi.fn(),
  listContainers: vi.fn().mockResolvedValue([]),
  restartContainer: vi.fn(),
  stopContainer: vi.fn(),
  removeContainer: vi.fn(),
  getContainerLogs: vi.fn().mockResolvedValue({ logs: '' }),
  checkDockerAvailable: vi.fn().mockResolvedValue(false),
  createContainer: vi.fn(),
}));

import { createApp } from '../app.js';

describe('Phase 4 集成测试', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  /* ===== RAID ===== */
  describe('RAID /api/storage/raid', () => {
    it('GET / 应返回阵列列表', async () => {
      raidService.listArrays.mockResolvedValueOnce([{ name: 'md0', level: 'raid1', devices: ['/dev/sdb'], spares: [], state: 'online', totalBytes: 1e12, usedBytes: 0, syncProgress: null }]);
      const res = await request(app).get('/api/storage/raid');
      expect(res.status).toBe(200);
      expect(res.body.data.arrays).toHaveLength(1);
      expect(res.body.data.arrays[0].name).toBe('md0');
    });

    it('POST / 应创建阵列', async () => {
      const res = await request(app).post('/api/storage/raid').send({ name: 'md1', level: 'raid5', devices: ['/dev/sdb', '/dev/sdc', '/dev/sdd'] });
      expect(res.status).toBe(201);
      expect(raidService.createArray).toHaveBeenCalledOnce();
      expect(res.body.data.array.name).toBe('md0');
    });

    it('POST / 缺字段应 400', async () => {
      const res = await request(app).post('/api/storage/raid').send({ name: 'md1' });
      expect(res.status).toBe(400);
    });

    it('GET /:name 应返回详情', async () => {
      const res = await request(app).get('/api/storage/raid/md0');
      expect(res.status).toBe(200);
      expect(res.body.data.array.name).toBe('md0');
    });

    it('POST /:name/add 应添加磁盘', async () => {
      const res = await request(app).post('/api/storage/raid/md0/add').send({ device: '/dev/sde' });
      expect(res.status).toBe(200);
      expect(raidService.addDevice).toHaveBeenCalledWith('md0', '/dev/sde');
    });

    it('POST /:name/remove 应移除磁盘', async () => {
      const res = await request(app).post('/api/storage/raid/md0/remove').send({ device: '/dev/sdc' });
      expect(res.status).toBe(200);
      expect(raidService.removeDevice).toHaveBeenCalledWith('md0', '/dev/sdc');
    });

    it('POST /:name/rebuild 应触发重建', async () => {
      const res = await request(app).post('/api/storage/raid/md0/rebuild');
      expect(res.status).toBe(200);
      expect(res.body.data.started).toBe(true);
    });

    it('DELETE /:name 应删除阵列', async () => {
      const res = await request(app).delete('/api/storage/raid/md0');
      expect(res.status).toBe(200);
      expect(res.body.data.removed).toBe(true);
    });
  });

  /* ===== LUKS ===== */
  describe('LUKS /api/luks', () => {
    it('GET /status 应返回卷列表', async () => {
      luksService.listStatus.mockResolvedValueOnce([{ name: 'enc0', device: '/dev/sdd', active: true, type: 'LUKS2', cipher: 'aes-xts-plain64', keySize: 512 }]);
      const res = await request(app).get('/api/luks/status');
      expect(res.status).toBe(200);
      expect(res.body.data.volumes).toHaveLength(1);
    });

    it('POST /create 应创建加密卷', async () => {
      const res = await request(app).post('/api/luks/create').send({ device: '/dev/sdd', passphrase: 'test123' });
      expect(res.status).toBe(201);
      expect(luksService.createVolume).toHaveBeenCalledOnce();
    });

    it('POST /create 缺 device 应 400', async () => {
      const res = await request(app).post('/api/luks/create').send({});
      expect(res.status).toBe(400);
    });

    it('POST /open 应解锁卷', async () => {
      const res = await request(app).post('/api/luks/open').send({ device: '/dev/sdd', name: 'enc0', passphrase: 'test123' });
      expect(res.status).toBe(200);
      expect(res.body.data.opened).toBe(true);
    });

    it('POST /close 应锁定卷', async () => {
      const res = await request(app).post('/api/luks/close').send({ name: 'enc0' });
      expect(res.status).toBe(200);
      expect(res.body.data.closed).toBe(true);
    });

    it('GET /:name 应返回卷详情', async () => {
      const res = await request(app).get('/api/luks/enc0');
      expect(res.status).toBe(200);
      expect(res.body.data.volume.name).toBe('enc0');
    });

    it('POST /keyfile 应生成密钥文件', async () => {
      const res = await request(app).post('/api/luks/keyfile').send({ name: 'enc0' });
      expect(res.status).toBe(201);
      expect(res.body.data.path).toContain('luks');
    });

    it('PUT /autounlock 应配置自动解锁', async () => {
      const res = await request(app).put('/api/luks/autounlock').send({ name: 'enc0', device: '/dev/sdd', keyfile: '/data/vibeos/secrets/luks/enc0.key' });
      expect(res.status).toBe(200);
      expect(res.body.data.updated).toBe(true);
    });
  });

  /* ===== SSD Cache ===== */
  describe('SSD Cache /api/ssd-cache', () => {
    it('GET /status 应返回缓存列表', async () => {
      ssdCacheService.getStatusList.mockResolvedValueOnce([{ name: 'c0', ssdDevice: '/dev/nvme0n1', poolDevice: '/dev/vg0/lv_data', mode: 'read', hitRate: 90, temperature: 40, lifePercent: 99 }]);
      const res = await request(app).get('/api/ssd-cache/status');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /create 应创建缓存', async () => {
      const res = await request(app).post('/api/ssd-cache/create').send({ ssdDevice: '/dev/nvme0n1', poolDevice: '/dev/vg0/lv_data', mode: 'read' });
      expect(res.status).toBe(201);
      expect(ssdCacheService.createCache).toHaveBeenCalledOnce();
    });

    it('POST /create 缺字段应 400', async () => {
      const res = await request(app).post('/api/ssd-cache/create').send({ ssdDevice: '/dev/nvme0n1' });
      expect(res.status).toBe(400);
    });

    it('GET /:name 应返回缓存详情', async () => {
      const res = await request(app).get('/api/ssd-cache/lv_data_cache');
      expect(res.status).toBe(200);
      expect(res.body.data.hitRate).toBe(85.5);
    });

    it('DELETE /:name 应移除缓存', async () => {
      const res = await request(app).delete('/api/ssd-cache/lv_data_cache');
      expect(res.status).toBe(200);
      expect(res.body.data.removed).toBe(true);
    });
  });

  /* ===== iSCSI ===== */
  describe('iSCSI /api/iscsi', () => {
    it('GET /targets 应返回 Target 列表', async () => {
      iscsiService.listTargets.mockResolvedValueOnce([{ iqn: 'iqn.test', luns: [], connections: 0, chapEnabled: false, initiatorWhitelist: [] }]);
      const res = await request(app).get('/api/iscsi/targets');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('POST /targets 应创建 Target', async () => {
      const res = await request(app).post('/api/iscsi/targets').send({
        iqn: 'iqn.2026-07.com.vibeos:storage',
        luns: [{ backingStore: '/dev/vg0/lv-data', sizeBytes: 107374182400 }],
      });
      expect(res.status).toBe(201);
      expect(iscsiService.createTarget).toHaveBeenCalledOnce();
    });

    it('POST /targets 缺 iqn 应 400', async () => {
      const res = await request(app).post('/api/iscsi/targets').send({ luns: [] });
      expect(res.status).toBe(400);
    });

    it('GET /targets/:iqn 应返回详情', async () => {
      const res = await request(app).get('/api/iscsi/targets/iqn.2026-07.com.vibeos:storage');
      expect(res.status).toBe(200);
      expect(res.body.data.chapEnabled).toBe(true);
    });

    it('DELETE /targets/:iqn 应删除 Target', async () => {
      const res = await request(app).delete('/api/iscsi/targets/iqn.2026-07.com.vibeos:storage');
      expect(res.status).toBe(200);
      expect(res.body.data.removed).toBe(true);
    });

    it('POST /targets/:iqn/lun 应添加 LUN', async () => {
      const res = await request(app).post('/api/iscsi/targets/iqn.2026-07.com.vibeos:storage/lun').send({ backingStore: '/dev/vg0/lv-extra', sizeBytes: 53687091200 });
      expect(res.status).toBe(201);
      expect(res.body.data.lunId).toBe(1);
    });

    it('DELETE /targets/:iqn/lun/:lunId 应移除 LUN', async () => {
      const res = await request(app).delete('/api/iscsi/targets/iqn.2026-07.com.vibeos:storage/lun/0');
      expect(res.status).toBe(200);
      expect(res.body.data.removed).toBe(true);
    });
  });
});
