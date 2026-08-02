/**
 * 模块：链路聚合（LACP/Bonding） — 业务逻辑层
 * 通过 ip 命令管理 bonding 接口，通过 /proc/net/bonding/ 读取状态
 */
import * as fs from 'node:fs/promises';
import { AppError } from '../../common/app-error.js';
import { executeCommandStrict } from '../../system/command-executor.js';
import type { BondInfo, BondMemberInfo, BondStatus, CreateBondRequest } from './lacp.types.js';

const BONDING_PROC_DIR = '/proc/net/bonding';

/** 解析 /proc/net/bonding/<name> 文件内容 */
function parseBondingFile(content: string, name: string): BondInfo {
  const lines = content.split('\n');
  let mode = '';
  let state: 'up' | 'down' = 'down';
  const members: BondMemberInfo[] = [];
  let currentMember: BondMemberInfo | null = null;
  let aggregatorId: number | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('Bonding Mode:')) {
      mode = trimmed.slice('Bonding Mode:'.length).trim();
    } else if (trimmed.startsWith('MII Status:') && currentMember === null) {
      state = trimmed.includes('up') ? 'up' : 'down';
    } else if (trimmed.startsWith('Aggregator ID:')) {
      const val = trimmed.slice('Aggregator ID:'.length).trim();
      aggregatorId = parseInt(val, 10) || null;
    } else if (trimmed.startsWith('Slave Interface:')) {
      if (currentMember) members.push(currentMember);
      currentMember = {
        name: trimmed.slice('Slave Interface:'.length).trim(),
        state: 'down',
        speed: null,
        duplex: null,
        linkFailureCount: 0,
        mac: '',
      };
    } else if (currentMember) {
      if (trimmed.startsWith('MII Status:')) {
        currentMember.state = trimmed.includes('up') ? 'up' : 'down';
      } else if (trimmed.startsWith('Speed:')) {
        currentMember.speed = trimmed.slice('Speed:'.length).trim();
      } else if (trimmed.startsWith('Duplex:')) {
        currentMember.duplex = trimmed.slice('Duplex:'.length).trim();
      } else if (trimmed.startsWith('Link Failure Count:')) {
        currentMember.linkFailureCount = parseInt(trimmed.slice('Link Failure Count:'.length).trim(), 10) || 0;
      } else if (trimmed.startsWith('Permanent HW addr:')) {
        currentMember.mac = trimmed.slice('Permanent HW addr:'.length).trim();
      }
    }
  }
  if (currentMember) members.push(currentMember);

  // 计算活跃成员总带宽
  let totalBandwidthMbps = 0;
  for (const m of members) {
    if (m.state === 'up' && m.speed) {
      const match = m.speed.match(/(\d+)/);
      if (match?.[1]) totalBandwidthMbps += parseInt(match[1], 10);
    }
  }

  return { name, mode, state, members, aggregatorId, totalBandwidthMbps };
}

/** 列出所有 Bonding 接口 */
export async function listBonds(): Promise<BondInfo[]> {
  let files: string[];
  try {
    files = await fs.readdir(BONDING_PROC_DIR);
  } catch {
    return [];
  }

  const bonds: BondInfo[] = [];
  for (const file of files) {
    try {
      const content = await fs.readFile(`${BONDING_PROC_DIR}/${file}`, 'utf-8');
      bonds.push(parseBondingFile(content, file));
    } catch {
      // 跳过无法读取的文件
    }
  }
  return bonds;
}

/** 创建 Bonding 接口 */
export async function createBond(req: CreateBondRequest): Promise<BondInfo> {
  // 检查是否已存在
  const existing = await listBonds();
  if (existing.some((b) => b.name === req.name)) {
    throw AppError.conflict(`Bonding 接口 ${req.name} 已存在`);
  }

  // 创建 bond 接口
  await executeCommandStrict('ip', ['link', 'add', req.name, 'type', 'bond', 'mode', req.mode]);

  // 添加成员网卡
  for (const member of req.members) {
    await executeCommandStrict('ip', ['link', 'set', member, 'down']);
    await executeCommandStrict('ip', ['link', 'set', member, 'master', req.name]);
    await executeCommandStrict('ip', ['link', 'set', member, 'up']);
  }

  // 启用 bond 接口
  await executeCommandStrict('ip', ['link', 'set', req.name, 'up']);

  // 返回创建后的信息
  const bonds = await listBonds();
  const created = bonds.find((b) => b.name === req.name);
  if (!created) throw AppError.internal(`Bonding ${req.name} 创建后未找到`);
  return created;
}

/** 删除 Bonding 接口 */
export async function deleteBond(name: string): Promise<{ name: string }> {
  const existing = await listBonds();
  if (!existing.some((b) => b.name === name)) {
    throw AppError.notFound(`Bonding 接口 [${name}]`);
  }

  await executeCommandStrict('ip', ['link', 'del', name]);
  return { name };
}

/** 添加成员网卡 */
export async function addMember(name: string, member: string): Promise<{ name: string; member: string }> {
  const existing = await listBonds();
  if (!existing.some((b) => b.name === name)) {
    throw AppError.notFound(`Bonding 接口 [${name}]`);
  }

  await executeCommandStrict('ip', ['link', 'set', member, 'down']);
  await executeCommandStrict('ip', ['link', 'set', member, 'master', name]);
  await executeCommandStrict('ip', ['link', 'set', member, 'up']);

  return { name, member };
}

/** 移除成员网卡 */
export async function removeMember(name: string, member: string): Promise<{ name: string; member: string }> {
  const existing = await listBonds();
  const bond = existing.find((b) => b.name === name);
  if (!bond) {
    throw AppError.notFound(`Bonding 接口 [${name}]`);
  }
  if (!bond.members.some((m) => m.name === member)) {
    throw AppError.notFound(`成员网卡 [${member}] (Bonding: ${name})`);
  }

  await executeCommandStrict('ip', ['link', 'set', member, 'nomaster']);
  await executeCommandStrict('ip', ['link', 'set', member, 'up']);

  return { name, member };
}

/** 获取 Bonding 状态详情 */
export async function getBondStatus(name: string): Promise<BondStatus> {
  let content: string;
  try {
    content = await fs.readFile(`${BONDING_PROC_DIR}/${name}`, 'utf-8');
  } catch {
    throw AppError.notFound(`Bonding 接口 [${name}]`);
  }

  const info = parseBondingFile(content, name);
  return {
    ...info,
    activeMembers: info.members.filter((m) => m.state === 'up').length,
    totalMembers: info.members.length,
  };
}
