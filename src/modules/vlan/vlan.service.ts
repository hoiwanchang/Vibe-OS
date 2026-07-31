/**
 * 模块：VLAN 管理 — 业务逻辑层
 * 通过 ip 命令管理 VLAN 子接口
 */
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import type { CreateVlanRequest, UpdateVlanRequest, VlanInfo } from './vlan.types.js';

/** ip -d -j link show type vlan 输出条目 */
interface IpLinkVlanEntry {
  ifname?: string;
  operstate?: string;
  address?: string;
  link?: string;
  linkinfo?: {
    info_data?: {
      protocol?: string;
      id?: number;
    };
  };
}

/** ip -j addr 输出条目 */
interface IpAddrEntry {
  ifname?: string;
  addr_info?: Array<{ family?: string; local?: string; prefixlen?: number }>;
}

/** 列出所有 VLAN 接口 */
export async function listVlans(): Promise<VlanInfo[]> {
  const linkResult = await executeCommand('ip', ['-d', '-j', 'link', 'show', 'type', 'vlan']);
  if (linkResult.exitCode !== 0) return [];

  let entries: IpLinkVlanEntry[];
  try {
    entries = JSON.parse(linkResult.stdout) as IpLinkVlanEntry[];
  } catch {
    return [];
  }

  // 获取所有接口的地址信息
  const addrMap = new Map<string, Array<{ family: 'inet' | 'inet6'; address: string; prefix: number }>>();
  const addrResult = await executeCommand('ip', ['-j', 'addr']);
  if (addrResult.exitCode === 0) {
    try {
      const addrs = JSON.parse(addrResult.stdout) as IpAddrEntry[];
      for (const a of addrs) {
        if (!a.ifname) continue;
        addrMap.set(a.ifname, (a.addr_info ?? []).map((info) => ({
          family: info.family === 'inet6' ? 'inet6' : 'inet',
          address: info.local ?? '',
          prefix: info.prefixlen ?? 0,
        })));
      }
    } catch {
      // 地址解析失败不影响 VLAN 列表
    }
  }

  return entries.map((entry) => ({
    id: entry.ifname ?? '',
    vlanId: entry.linkinfo?.info_data?.id ?? 0,
    parentInterface: entry.link ?? '',
    state: entry.operstate === 'UP' ? 'up' : 'down',
    mac: entry.address ?? '',
    protocol: entry.linkinfo?.info_data?.protocol ?? '802.1Q',
    addresses: addrMap.get(entry.ifname ?? '') ?? [],
  }));
}

/** 创建 VLAN */
export async function createVlan(req: CreateVlanRequest): Promise<VlanInfo> {
  const vlanName = `${req.parentInterface}.${req.vlanId}`;

  // 检查是否已存在
  const existing = await listVlans();
  if (existing.some((v) => v.id === vlanName)) {
    throw AppError.conflict(`VLAN ${vlanName} 已存在`);
  }

  // 创建 VLAN 子接口
  await executeCommandStrict('ip', [
    'link', 'add', 'link', req.parentInterface,
    'name', vlanName, 'type', 'vlan', 'id', String(req.vlanId),
  ]);

  // 启用接口
  await executeCommandStrict('ip', ['link', 'set', vlanName, 'up']);

  // 配置 IP（可选）
  if (req.ipAddress) {
    await executeCommandStrict('ip', ['addr', 'add', req.ipAddress, 'dev', vlanName]);
  }

  // 返回创建后的 VLAN 信息
  const vlans = await listVlans();
  const created = vlans.find((v) => v.id === vlanName);
  if (!created) throw AppError.internal(`VLAN ${vlanName} 创建后未找到`);
  return created;
}

/** 删除 VLAN */
export async function deleteVlan(id: string): Promise<{ id: string }> {
  const existing = await listVlans();
  if (!existing.some((v) => v.id === id)) {
    throw AppError.notFound(`VLAN [${id}]`);
  }

  await executeCommandStrict('ip', ['link', 'del', id]);
  return { id };
}

/** 更新 VLAN（修改 IP 地址） */
export async function updateVlan(id: string, req: UpdateVlanRequest): Promise<VlanInfo> {
  const existing = await listVlans();
  if (!existing.some((v) => v.id === id)) {
    throw AppError.notFound(`VLAN [${id}]`);
  }

  // 清除旧地址并设置新地址
  await executeCommandStrict('ip', ['addr', 'flush', 'dev', id]);
  await executeCommandStrict('ip', ['addr', 'add', req.ipAddress, 'dev', id]);

  const vlans = await listVlans();
  const updated = vlans.find((v) => v.id === id);
  if (!updated) throw AppError.internal(`VLAN ${id} 更新后未找到`);
  return updated;
}
