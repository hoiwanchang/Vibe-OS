/**
 * 模块：VLAN 管理 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));
vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../vlan.service.js';

/** 模拟 ip -d -j link show type vlan 输出 */
function mockVlanLinkOutput(vlans: Array<{ ifname: string; link: string; id: number; operstate?: string; address?: string }>) {
  return JSON.stringify(vlans.map((v) => ({
    ifname: v.ifname,
    operstate: v.operstate ?? 'UP',
    address: v.address ?? 'aa:bb:cc:dd:ee:ff',
    link: v.link,
    linkinfo: { info_data: { protocol: '802.1Q', id: v.id } },
  })));
}

/** 模拟 ip -j addr 输出 */
function mockAddrOutput(addrs: Array<{ ifname: string; local: string; prefixlen: number; family?: string }>) {
  return JSON.stringify(addrs.map((a) => ({
    ifname: a.ifname,
    addr_info: [{ family: a.family ?? 'inet', local: a.local, prefixlen: a.prefixlen }],
  })));
}

describe('VLAN 管理', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  /* ---------- listVlans ---------- */

  describe('listVlans', () => {
    it('应解析 ip -d -j link show type vlan 输出', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: mockVlanLinkOutput([
            { ifname: 'eth0.100', link: 'eth0', id: 100 },
            { ifname: 'eth0.200', link: 'eth0', id: 200, operstate: 'DOWN' },
          ]),
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: mockAddrOutput([
            { ifname: 'eth0.100', local: '192.168.100.1', prefixlen: 24 },
          ]),
          stderr: '',
        });

      const vlans = await service.listVlans();
      expect(vlans).toHaveLength(2);
      expect(vlans[0]?.id).toBe('eth0.100');
      expect(vlans[0]?.vlanId).toBe(100);
      expect(vlans[0]?.parentInterface).toBe('eth0');
      expect(vlans[0]?.state).toBe('up');
      expect(vlans[0]?.addresses[0]?.address).toBe('192.168.100.1');
      expect(vlans[1]?.state).toBe('down');
    });

    it('命令失败时应返回空数组', async () => {
      mockExecuteCommand.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'error' });

      const vlans = await service.listVlans();
      expect(vlans).toEqual([]);
    });

    it('JSON 解析失败时应返回空数组', async () => {
      mockExecuteCommand.mockResolvedValueOnce({ exitCode: 0, stdout: 'not json', stderr: '' });

      const vlans = await service.listVlans();
      expect(vlans).toEqual([]);
    });
  });

  /* ---------- createVlan ---------- */

  describe('createVlan', () => {
    it('应成功创建 VLAN', async () => {
      // listVlans 检查不存在
      mockExecuteCommand
        .mockResolvedValueOnce({ exitCode: 0, stdout: mockVlanLinkOutput([]), stderr: '' })
        .mockResolvedValueOnce({ exitCode: 0, stdout: mockAddrOutput([]), stderr: '' });
      // ip link add + ip link set up
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      // 创建后 listVlans
      mockExecuteCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: mockVlanLinkOutput([{ ifname: 'eth0.100', link: 'eth0', id: 100 }]),
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: mockAddrOutput([{ ifname: 'eth0.100', local: '192.168.100.1', prefixlen: 24 }]),
          stderr: '',
        });

      const vlan = await service.createVlan({ parentInterface: 'eth0', vlanId: 100, ipAddress: '192.168.100.1/24' });
      expect(vlan.id).toBe('eth0.100');
      expect(vlan.vlanId).toBe(100);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', [
        'link', 'add', 'link', 'eth0', 'name', 'eth0.100', 'type', 'vlan', 'id', '100',
      ]);
    });

    it('VLAN 已存在时应抛出 409', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: mockVlanLinkOutput([{ ifname: 'eth0.100', link: 'eth0', id: 100 }]),
          stderr: '',
        })
        .mockResolvedValueOnce({ exitCode: 0, stdout: mockAddrOutput([]), stderr: '' });

      await expect(
        service.createVlan({ parentInterface: 'eth0', vlanId: 100 }),
      ).rejects.toThrow('已存在');
    });
  });

  /* ---------- deleteVlan ---------- */

  describe('deleteVlan', () => {
    it('应成功删除 VLAN', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: mockVlanLinkOutput([{ ifname: 'eth0.100', link: 'eth0', id: 100 }]),
          stderr: '',
        })
        .mockResolvedValueOnce({ exitCode: 0, stdout: mockAddrOutput([]), stderr: '' });
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.deleteVlan('eth0.100');
      expect(result.id).toBe('eth0.100');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['link', 'del', 'eth0.100']);
    });

    it('VLAN 不存在时应抛出 404', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ exitCode: 0, stdout: mockVlanLinkOutput([]), stderr: '' })
        .mockResolvedValueOnce({ exitCode: 0, stdout: mockAddrOutput([]), stderr: '' });

      await expect(service.deleteVlan('eth0.999')).rejects.toThrow('不存在');
    });
  });

  /* ---------- updateVlan ---------- */

  describe('updateVlan', () => {
    it('应成功更新 VLAN IP', async () => {
      // 检查存在
      mockExecuteCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: mockVlanLinkOutput([{ ifname: 'eth0.100', link: 'eth0', id: 100 }]),
          stderr: '',
        })
        .mockResolvedValueOnce({ exitCode: 0, stdout: mockAddrOutput([]), stderr: '' });
      // flush + add
      mockExecuteCommandStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      // 更新后 listVlans
      mockExecuteCommand
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: mockVlanLinkOutput([{ ifname: 'eth0.100', link: 'eth0', id: 100 }]),
          stderr: '',
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: mockAddrOutput([{ ifname: 'eth0.100', local: '10.0.0.1', prefixlen: 24 }]),
          stderr: '',
        });

      const vlan = await service.updateVlan('eth0.100', { ipAddress: '10.0.0.1/24' });
      expect(vlan.addresses[0]?.address).toBe('10.0.0.1');
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['addr', 'flush', 'dev', 'eth0.100']);
      expect(mockExecuteCommandStrict).toHaveBeenCalledWith('ip', ['addr', 'add', '10.0.0.1/24', 'dev', 'eth0.100']);
    });

    it('VLAN 不存在时应抛出 404', async () => {
      mockExecuteCommand
        .mockResolvedValueOnce({ exitCode: 0, stdout: mockVlanLinkOutput([]), stderr: '' })
        .mockResolvedValueOnce({ exitCode: 0, stdout: mockAddrOutput([]), stderr: '' });

      await expect(
        service.updateVlan('eth0.999', { ipAddress: '10.0.0.1/24' }),
      ).rejects.toThrow('不存在');
    });
  });
});
