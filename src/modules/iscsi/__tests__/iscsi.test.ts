/**
 * 模块：iSCSI Target 管理 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn(),
  executeCommandStrict: vi.fn(),
}));

import { executeCommandStrict } from '../../../system/command-executor.js';
import * as service from '../iscsi.service.js';

const mockExecStrict = vi.mocked(executeCommandStrict);

/** 模拟 targetcli 输出 */
function mockTargetcli(output: string) {
  mockExecStrict.mockResolvedValue({ stdout: output, stderr: '', exitCode: 0 });
}

describe('iSCSI Target 管理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ---------- listTargets ---------- */

  describe('listTargets', () => {
    it('无 Target 时应返回空数组', async () => {
      mockTargetcli('o- iscsi .................................................. [Targets: 0]\n');

      const targets = await service.listTargets();
      expect(targets).toEqual([]);
    });

    it('应解析 Target 列表', async () => {
      // /iscsi ls 输出
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- iscsi .................................................. [Targets: 1]\n  o- iqn.2026-07.com.vibeos:storage1 ..................... [TPGs: 1]\n',
        stderr: '', exitCode: 0,
      });
      // /iscsi/<iqn>/tpg1 ls 输出
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- tpg1 ................................................. [no-gen-acls, no-auth]\n  o- luns ............................................... [Luns: 1]\n    o- lun0 ............................................. [fileio /data/disk0.img (rw)]\n',
        stderr: '', exitCode: 0,
      });
      // sessions ls
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- sessions ............................................. [Sessions: 0]\n',
        stderr: '', exitCode: 0,
      });

      const targets = await service.listTargets();
      expect(targets.length).toBe(1);
      expect(targets[0]!.iqn).toBe('iqn.2026-07.com.vibeos:storage1');
      expect(targets[0]!.tpg).toBe(1);
    });
  });

  /* ---------- createTarget ---------- */

  describe('createTarget', () => {
    it('应成功创建 Target', async () => {
      // listTargets 检查不存在 → /iscsi ls
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- iscsi .................................................. [Targets: 0]\n',
        stderr: '', exitCode: 0,
      });
      // 后续所有 targetcli 命令成功
      mockExecStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.createTarget({
        iqn: 'iqn.2026-07.com.vibeos:test1',
        luns: [{ backingStore: '/data/disk0.img', sizeBytes: 10737418240 }],
      });

      expect(result.iqn).toBe('iqn.2026-07.com.vibeos:test1');
      // 应调用: /iscsi ls, fileio create, /iscsi create, luns create, set attribute
      expect(mockExecStrict).toHaveBeenCalledWith('targetcli', expect.arrayContaining([
        expect.stringContaining('/iscsi create'),
      ]));
    });

    it('Target 已存在时应抛出 409', async () => {
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- iscsi .................................................. [Targets: 1]\n  o- iqn.2026-07.com.vibeos:test1 ..................... [TPGs: 1]\n',
        stderr: '', exitCode: 0,
      });
      // getTargetDetail 调用
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- tpg1 ................................................. [no-gen-acls, no-auth]\n',
        stderr: '', exitCode: 0,
      });
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- sessions ............................................. [Sessions: 0]\n',
        stderr: '', exitCode: 0,
      });

      await expect(
        service.createTarget({
          iqn: 'iqn.2026-07.com.vibeos:test1',
          luns: [{ backingStore: '/dev/sdc' }],
        }),
      ).rejects.toThrow('已存在');
    });

    it('带 CHAP 和白名单创建应配置认证', async () => {
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- iscsi .................................................. [Targets: 0]\n',
        stderr: '', exitCode: 0,
      });
      mockExecStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      await service.createTarget({
        iqn: 'iqn.2026-07.com.vibeos:secure1',
        luns: [{ backingStore: '/dev/sdc' }],
        chapUser: 'admin',
        chapPassword: 'secret123',
        initiatorWhitelist: ['iqn.2026-07.com.client:host1'],
      });

      // 验证 CHAP 配置命令被调用
      expect(mockExecStrict).toHaveBeenCalledWith('targetcli', expect.arrayContaining([
        expect.stringContaining('authentication=1'),
      ]));
      expect(mockExecStrict).toHaveBeenCalledWith('targetcli', expect.arrayContaining([
        expect.stringContaining('userid=admin'),
      ]));
      // 验证 ACL 创建
      expect(mockExecStrict).toHaveBeenCalledWith('targetcli', expect.arrayContaining([
        expect.stringContaining('acls create iqn.2026-07.com.client:host1'),
      ]));
    });
  });

  /* ---------- deleteTarget ---------- */

  describe('deleteTarget', () => {
    it('应成功删除 Target', async () => {
      // listTargets
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- iscsi .................................................. [Targets: 1]\n  o- iqn.2026-07.com.vibeos:test1 ..................... [TPGs: 1]\n',
        stderr: '', exitCode: 0,
      });
      // getTargetDetail
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- tpg1 ................................................. [no-gen-acls, no-auth]\n',
        stderr: '', exitCode: 0,
      });
      // sessions
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- sessions ............................................. [Sessions: 0]\n',
        stderr: '', exitCode: 0,
      });
      // delete
      mockExecStrict.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.deleteTarget('iqn.2026-07.com.vibeos:test1');
      expect(result.iqn).toBe('iqn.2026-07.com.vibeos:test1');
      expect(mockExecStrict).toHaveBeenCalledWith('targetcli', ['/iscsi delete iqn.2026-07.com.vibeos:test1']);
    });

    it('Target 不存在时应抛出 404', async () => {
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- iscsi .................................................. [Targets: 0]\n',
        stderr: '', exitCode: 0,
      });

      await expect(
        service.deleteTarget('iqn.2026-07.com.vibeos:nonexist'),
      ).rejects.toThrow('不存在');
    });
  });

  /* ---------- addLun ---------- */

  describe('addLun', () => {
    it('应成功添加 LUN', async () => {
      // listTargets → 找到 target
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- iscsi .................................................. [Targets: 1]\n  o- iqn.2026-07.com.vibeos:test1 ..................... [TPGs: 1]\n',
        stderr: '', exitCode: 0,
      });
      // getTargetDetail
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- tpg1 ................................................. [no-gen-acls, no-auth]\n  o- luns ............................................... [Luns: 1]\n    o- lun0 ............................................. [fileio /data/disk0.img (rw)]\n',
        stderr: '', exitCode: 0,
      });
      // sessions
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- sessions ............................................. [Sessions: 0]\n',
        stderr: '', exitCode: 0,
      });
      // fileio create + luns create
      mockExecStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.addLun('iqn.2026-07.com.vibeos:test1', {
        backingStore: '/data/disk1.img',
        sizeBytes: 5368709120,
      });
      expect(result.message).toContain('LUN');
    });

    it('Target 不存在时应抛出 404', async () => {
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- iscsi .................................................. [Targets: 0]\n',
        stderr: '', exitCode: 0,
      });

      await expect(
        service.addLun('iqn.2026-07.com.vibeos:nonexist', { backingStore: '/dev/sdd' }),
      ).rejects.toThrow('不存在');
    });
  });

  /* ---------- removeLun ---------- */

  describe('removeLun', () => {
    it('LUN 不存在时应抛出 404', async () => {
      // listTargets
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- iscsi .................................................. [Targets: 1]\n  o- iqn.2026-07.com.vibeos:test1 ..................... [TPGs: 1]\n',
        stderr: '', exitCode: 0,
      });
      // getTargetDetail — 只有 lun0
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- tpg1 ................................................. [no-gen-acls, no-auth]\n  o- luns ............................................... [Luns: 1]\n    o- lun0 ............................................. [fileio /data/disk0.img (rw)]\n',
        stderr: '', exitCode: 0,
      });
      // sessions
      mockExecStrict.mockResolvedValueOnce({
        stdout: 'o- sessions ............................................. [Sessions: 0]\n',
        stderr: '', exitCode: 0,
      });

      await expect(
        service.removeLun('iqn.2026-07.com.vibeos:test1', 99),
      ).rejects.toThrow('不存在');
    });
  });
});
