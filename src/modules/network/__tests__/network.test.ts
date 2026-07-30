/**
 * 模块：网络配置 — 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecuteCommand = vi.fn();
const mockExecuteCommandStrict = vi.fn();
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  executeCommandStrict: (...args: unknown[]) => mockExecuteCommandStrict(...args),
}));
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));
vi.mock('../../../config.js', () => ({
  DATA_ROOT: '/data',
  VIBEOS_APP_DIR: '/data/vibeos',
  COMMAND_TIMEOUT_MS: 5000,
}));

import * as service from '../network.service.js';

describe('网络配置', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('listInterfaces', () => {
    it('应解析 ip -j addr 输出', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify([
          { ifname: 'eth0', link_type: 'ether', operstate: 'UP', address: 'aa:bb:cc:dd:ee:ff', addr_info: [{ family: 'inet', local: '192.168.1.10', prefixlen: 24 }] },
          { ifname: 'lo', link_type: 'loopback', operstate: 'UNKNOWN', address: '00:00:00:00:00:00', addr_info: [] },
        ]),
        stderr: '',
      });
      const ifaces = await service.listInterfaces();
      expect(ifaces).toHaveLength(2);
      expect(ifaces[0]?.name).toBe('eth0');
      expect(ifaces[0]?.state).toBe('up');
      expect(ifaces[0]?.addresses[0]?.address).toBe('192.168.1.10');
    });
  });

  describe('getDns', () => {
    it('应解析 resolv.conf', async () => {
      mockReadFile.mockResolvedValue('nameserver 8.8.8.8\nnameserver 1.1.1.1\nsearch local\n');
      const dns = await service.getDns();
      expect(dns.servers).toEqual(['8.8.8.8', '1.1.1.1']);
      expect(dns.search).toEqual(['local']);
    });
  });

  describe('listFirewallRules', () => {
    it('应解析 iptables 输出', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'Chain INPUT (policy ACCEPT)\nnum  target  prot  source  destination\n1  ACCEPT  tcp  0.0.0.0/0  0.0.0.0/0\n2  DROP  all  10.0.0.0/8  0.0.0.0/0\n',
        stderr: '',
      });
      const result = await service.listFirewallRules();
      expect(result.rules.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('listPorts', () => {
    it('应解析 ss 输出', async () => {
      mockExecuteCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'State  Recv-Q  Send-Q  Local Address:Port  Peer Address:Port  Process\nLISTEN  0  128  0.0.0.0:22  0.0.0.0:*  users:(("sshd",pid=123,fd=3))\n',
        stderr: '',
      });
      const ports = await service.listPorts();
      expect(ports).toHaveLength(1);
      expect(ports[0]?.port).toBe(22);
      expect(ports[0]?.process).toBe('sshd');
    });
  });

  describe('sendWol', () => {
    it('成功应返回 true', async () => {
      mockExecuteCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      const sent = await service.sendWol('aa:bb:cc:dd:ee:ff');
      expect(sent).toBe(true);
    });
  });
});
