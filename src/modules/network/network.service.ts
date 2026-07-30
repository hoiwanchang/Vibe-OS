/**
 * 模块：网络配置 — 业务逻辑层
 */
import * as fs from 'node:fs/promises';
import { VIBEOS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import type { NetInterface, FirewallRule, ListeningPort, DnsConfig } from './network.types.js';

const WOL_DEVICES_FILE = `${VIBEOS_APP_DIR}/network/wol-devices.json`;

/** 列出网络接口 */
export async function listInterfaces(): Promise<NetInterface[]> {
  const result = await executeCommand('ip', ['-j', 'addr']);
  if (result.exitCode !== 0) return [];

  try {
    const parsed = JSON.parse(result.stdout) as Array<{
      ifname?: string;
      link_type?: string;
      operstate?: string;
      address?: string;
      addr_info?: Array<{ family?: string; local?: string; prefixlen?: number }>;
    }>;
    return parsed.map((iface) => {
      const typeMap: Record<string, NetInterface['type']> = {
        ether: 'ethernet', loopback: 'loopback', bridge: 'bridge', vlan: 'vlan',
      };
      return {
        name: iface.ifname ?? '',
        type: typeMap[iface.link_type ?? ''] ?? 'ethernet',
        state: iface.operstate === 'UP' ? 'up' : 'down',
        method: 'dhcp' as const,
        addresses: (iface.addr_info ?? []).map((a) => ({
          family: a.family === 'inet6' ? 'inet6' : 'inet',
          address: a.local ?? '',
          prefix: a.prefixlen ?? 0,
        })),
        mac: iface.address ?? '',
        speed: null,
        gateway: null,
      };
    });
  } catch {
    return [];
  }
}

/** 配置接口 */
export async function configureInterface(name: string, config: { method: 'dhcp' | 'static'; ip?: string; netmask?: string; gateway?: string; dns?: string[] }): Promise<NetInterface> {
  // 使用 ip 命令进行基本配置
  if (config.method === 'static' && config.ip) {
    await executeCommandStrict('ip', ['addr', 'flush', 'dev', name]);
    await executeCommandStrict('ip', ['addr', 'add', `${config.ip}/${config.netmask ?? '24'}`, 'dev', name]);
    if (config.gateway) {
      await executeCommandStrict('ip', ['route', 'add', 'default', 'via', config.gateway]);
    }
  } else {
    // DHCP — 通过 systemctl restart networking 或 dhclient
    await executeCommandStrict('ip', ['link', 'set', name, 'up']);
  }
  const interfaces = await listInterfaces();
  const iface = interfaces.find((i) => i.name === name);
  if (!iface) throw AppError.notFound(`网络接口 [${name}]`);
  return iface;
}

/** 获取 DNS 配置 */
export async function getDns(): Promise<DnsConfig> {
  try {
    const content = await fs.readFile('/etc/resolv.conf', 'utf-8');
    const servers: string[] = [];
    const search: string[] = [];
    for (const line of content.split('\n')) {
      if (line.startsWith('nameserver')) {
        const ns = line.split(/\s+/)[1];
        if (ns) servers.push(ns);
      } else if (line.startsWith('search')) {
        search.push(...line.split(/\s+/).slice(1));
      }
    }
    return { servers, search };
  } catch {
    return { servers: [], search: [] };
  }
}

/** 修改 DNS */
export async function setDns(servers: string[], search?: string[]): Promise<boolean> {
  let content = '';
  for (const s of servers) content += `nameserver ${s}\n`;
  if (search && search.length > 0) content += `search ${search.join(' ')}\n`;
  await fs.writeFile('/etc/resolv.conf', content, 'utf-8');
  return true;
}

/** 获取防火墙规则 */
export async function listFirewallRules(): Promise<{ rules: FirewallRule[]; defaultPolicy: { input: string; forward: string; output: string } }> {
  const result = await executeCommand('iptables', ['-L', '-n', '--line-numbers']);
  const rules: FirewallRule[] = [];
  if (result.exitCode === 0) {
    let currentChain = '';
    for (const line of result.stdout.split('\n')) {
      const chainMatch = line.match(/^Chain (\w+)/);
      if (chainMatch) {
        currentChain = (chainMatch[1] ?? '').toLowerCase();
        continue;
      }
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4 && /^\d+$/.test(parts[0] ?? '')) {
        const action = (parts[1] ?? '').toLowerCase();
        if (['accept', 'drop', 'reject'].includes(action)) {
          rules.push({
            id: `${currentChain}-${parts[0]}`,
            chain: currentChain as FirewallRule['chain'],
            protocol: (parts[2] ?? 'all') as FirewallRule['protocol'],
            port: null,
            action: action as FirewallRule['action'],
            source: parts[3] !== '0.0.0.0/0' ? (parts[3] ?? null) : null,
            comment: '',
          });
        }
      }
    }
  }
  return { rules, defaultPolicy: { input: 'accept', forward: 'accept', output: 'accept' } };
}

/** 添加防火墙规则 */
export async function addFirewallRule(rule: { chain: string; protocol: string; port: number | string | null; action: string; source?: string; comment?: string }): Promise<FirewallRule> {
  const args = ['-A', rule.chain.toUpperCase()];
  if (rule.source) args.push('-s', rule.source);
  args.push('-p', rule.protocol);
  if (rule.port) args.push('--dport', String(rule.port));
  if (rule.comment) args.push('-m', 'comment', '--comment', rule.comment);
  args.push('-j', rule.action.toUpperCase());
  await executeCommandStrict('iptables', args);
  return {
    id: `${rule.chain}-new`,
    chain: rule.chain as FirewallRule['chain'],
    protocol: rule.protocol as FirewallRule['protocol'],
    port: rule.port,
    action: rule.action as FirewallRule['action'],
    source: rule.source ?? null,
    comment: rule.comment ?? '',
  };
}

/** 删除防火墙规则 */
export async function removeFirewallRule(id: string): Promise<string> {
  const [chain, num] = id.split('-');
  if (!chain || !num) throw AppError.badRequest('INVALID_ID', '无效的规则 ID');
  await executeCommandStrict('iptables', ['-D', chain.toUpperCase(), num]);
  return id;
}

/** 获取监听端口 */
export async function listPorts(): Promise<ListeningPort[]> {
  const result = await executeCommand('ss', ['-tlnp']);
  if (result.exitCode !== 0) return [];

  const ports: ListeningPort[] = [];
  const lines = result.stdout.trim().split('\n').slice(1);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 4) {
      const localAddr = parts[3] ?? '';
      const portMatch = localAddr.match(/:(\d+)$/);
      const procMatch = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
      ports.push({
        protocol: parts[0] ?? 'tcp',
        localAddress: localAddr,
        port: parseInt(portMatch?.[1] ?? '0', 10),
        process: procMatch?.[1] ?? null,
        pid: procMatch?.[2] ? parseInt(procMatch[2], 10) : null,
      });
    }
  }
  return ports;
}

/** 获取 WoL 设备列表 */
export async function listWolDevices(): Promise<Array<{ name: string; mac: string }>> {
  try {
    return JSON.parse(await fs.readFile(WOL_DEVICES_FILE, 'utf-8')) as Array<{ name: string; mac: string }>;
  } catch {
    return [];
  }
}

/** 发送 WoL 魔术包 */
export async function sendWol(mac: string, broadcast?: string): Promise<boolean> {
  const args = [mac];
  if (broadcast) args.push('-i', broadcast);
  const result = await executeCommand('wakeonlan', args);
  return result.exitCode === 0;
}
