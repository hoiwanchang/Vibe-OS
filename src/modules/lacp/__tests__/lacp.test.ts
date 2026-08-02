/**
 * 模块：链路聚合（LACP/Bonding） — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommandStrict = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn(),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));

const mockReadFile = vi.fn();
const mockReaddir = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
}));

vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../lacp.service.js';

/** 模拟 /proc/net/bonding/bond0 文件内容 */
const BOND0_CONTENT = `Ethernet Channel Bonding Driver: v5.15.0

Bonding Mode: IEEE 802.3ad Dynamic link aggregation
MII Status: up
Aggregator ID: 1

Slave Interface: eth0
MII Status: up
Speed: 1000 Mbps
Duplex: full
Link Failure Count: 0
Permanent HW addr: aa:bb:cc:dd:ee:01

Slave Interface: eth1
MII Status: up
Speed: 1000 Mbps
Duplex: full
Link Failure Count: 1
Permanent HW addr: aa:bb:cc:dd:ee:02
`;

const BOND1_CONTENT = `Ethernet Channel Bonding Driver: v5.15.0

Bonding Mode: fault-tolerance (active-backup)
MII Status: up

Slave Interface: eth2
MII Status: up
Speed: 10000 Mbps
Duplex: full
Link Failure Count: 0
Permanent HW addr: aa:bb:cc:dd:ee:03

Slave Interface: eth3
MII Status: down
Speed: Unknown
Duplex: Unknown
Link Failure Count: 3
Permanent HW addr: aa:bb:cc:dd:ee:04
`;

describe('链路聚合（LACP/Bonding）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  /* ---------- listBonds ---------- */

  describe('listBonds', () => {
    it('应解析 /proc/net/bonding/ 目录', async () => {
      mockReaddir.mockResolvedValue(['bond0', 'bond1']);
      mockReadFile
        .mockResolvedValueOnce(BOND0_CONTENT)
        .mockResolvedValueOnce(BOND1_CONTENT);

      const bonds = await service.listBonds();
      expect(bonds).toHaveLength(2);

      // bond0 — 802.3ad
      expect(bonds[0]?.name).toBe('bond0');
      expect(bonds[0]?.mode).toBe('IEEE 802.3ad Dynamic link aggregation');
      expect(bonds[0]?.state).toBe('up');
      expect(bonds[0]?.members).toHaveLength(2);
      expect(bonds[0]?.members[0]?.name).toBe('eth0');
      expect(bonds[0]?.members[0]?.speed).toBe('1000 Mbps');
      expect(bonds[0]?.members[0]?.linkFailureCount).toBe(0);
      expect(bonds[0]?.members[1]?.linkFailureCount).toBe(1);
      expect(bonds[0]?.aggregatorId).toBe(1);
      expect(bonds[0]?.totalBandwidthMbps).toBe(2000);

      // bond1 — active-backup
      expect(bonds[1]?.name).toBe('bond1');
      expect(bonds[1]?.totalBandwidthMbps).toBe(10000); // 只有 eth2 活跃
    });

    it('目录不存在时应返回空数组', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT'));

      const bonds = await service.listBonds();
      expect(bonds).toEqual([]);
    });

    it('文件读取失败时应跳过', async () => {
      mockReaddir.mockResolvedValue(['bond0', 'bad']);
      mockReadFile
        .mockResolvedValueOnce(BOND0_CONTENT)
        .mockRejectedValueOnce(new Error('EACCES'));

      const bonds = await service.listBonds();
      expect(bonds).toHaveLength(1);
    });
  });

  /* ---------- createBond ---------- */

  describe('createBond', () => {
    it('应成功创建 Bonding', async () => {
      // 第一次 listBonds 检查不存在，第二次返回创建结果
      mockReaddir.mockResolvedValueOnce([]);
      mockReaddir.mockResolvedValue(['bond0']);
      mockReadFile.mockResolvedValue(BOND0_CONTENT);
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const bond = await service.createBond({ name: 'bond0', mode: '802.3ad', members: ['eth0', 'eth1'] });
      expect(bond.name).toBe('bond0');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['link', 'add', 'bond0', 'type', 'bond', 'mode', '802.3ad']);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['link', 'set', 'eth0', 'master', 'bond0']);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['link', 'set', 'eth1', 'master', 'bond0']);
    });

    it('Bonding 已存在时应抛出 409', async () => {
      mockReaddir.mockResolvedValue(['bond0']);
      mockReadFile.mockResolvedValue(BOND0_CONTENT);

      await expect(
        service.createBond({ name: 'bond0', mode: '802.3ad', members: ['eth0'] }),
      ).rejects.toThrow('已存在');
    });
  });

  /* ---------- deleteBond ---------- */

  describe('deleteBond', () => {
    it('应成功删除 Bonding', async () => {
      mockReaddir.mockResolvedValue(['bond0']);
      mockReadFile.mockResolvedValue(BOND0_CONTENT);
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.deleteBond('bond0');
      expect(result.name).toBe('bond0');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['link', 'del', 'bond0']);
    });

    it('Bonding 不存在时应抛出 404', async () => {
      mockReaddir.mockResolvedValue([]);

      await expect(service.deleteBond('bond99')).rejects.toThrow('不存在');
    });
  });

  /* ---------- addMember ---------- */

  describe('addMember', () => {
    it('应成功添加成员', async () => {
      mockReaddir.mockResolvedValue(['bond0']);
      mockReadFile.mockResolvedValue(BOND0_CONTENT);
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.addMember('bond0', 'eth2');
      expect(result).toEqual({ name: 'bond0', member: 'eth2' });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['link', 'set', 'eth2', 'down']);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['link', 'set', 'eth2', 'master', 'bond0']);
    });

    it('Bonding 不存在时应抛出 404', async () => {
      mockReaddir.mockResolvedValue([]);

      await expect(service.addMember('bond99', 'eth0')).rejects.toThrow('不存在');
    });
  });

  /* ---------- removeMember ---------- */

  describe('removeMember', () => {
    it('应成功移除成员', async () => {
      mockReaddir.mockResolvedValue(['bond0']);
      mockReadFile.mockResolvedValue(BOND0_CONTENT);
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.removeMember('bond0', 'eth0');
      expect(result).toEqual({ name: 'bond0', member: 'eth0' });
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['link', 'set', 'eth0', 'nomaster']);
    });

    it('成员不存在时应抛出 404', async () => {
      mockReaddir.mockResolvedValue(['bond0']);
      mockReadFile.mockResolvedValue(BOND0_CONTENT);

      await expect(service.removeMember('bond0', 'eth99')).rejects.toThrow('不存在');
    });
  });

  /* ---------- getBondStatus ---------- */

  describe('getBondStatus', () => {
    it('应返回聚合状态', async () => {
      mockReadFile.mockResolvedValue(BOND0_CONTENT);

      const status = await service.getBondStatus('bond0');
      expect(status.name).toBe('bond0');
      expect(status.activeMembers).toBe(2);
      expect(status.totalMembers).toBe(2);
      expect(status.totalBandwidthMbps).toBe(2000);
    });

    it('Bonding 不存在时应抛出 404', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await expect(service.getBondStatus('bond99')).rejects.toThrow('不存在');
    });

    it('应正确统计部分活跃成员', async () => {
      mockReadFile.mockResolvedValue(BOND1_CONTENT);

      const status = await service.getBondStatus('bond1');
      expect(status.activeMembers).toBe(1);
      expect(status.totalMembers).toBe(2);
      expect(status.totalBandwidthMbps).toBe(10000);
    });
  });
});
