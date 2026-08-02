/**
 * 模块：DNS 服务器 — 业务逻辑层
 * 基于 dnsmasq 实现本地 DNS 服务
 * 自定义记录存储在 VIBEOS_APP_DIR/dns/records.json
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AppError } from '../../common/app-error.js';
import { executeCommand } from '../../system/command-executor.js';
import { VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import type {
  CreateDnsRecordRequest,
  DnsConfig,
  DnsRecord,
  DnsResult,
  DnsStatus,
  UpdateDnsConfigRequest,
} from './dns.types.js';

/** DNS 数据目录 */
const DNS_DIR = `${VIBEOS_APP_DIR}/dns`;
/** 记录文件路径 */
const RECORDS_FILE = `${DNS_DIR}/records.json`;
/** 配置文件路径 */
const CONFIG_FILE = `${DNS_DIR}/config.json`;
/** 默认 TTL */
const DEFAULT_TTL = 3600;
/** 默认配置 */
const DEFAULT_CONFIG: DnsConfig = {
  upstreamServers: ['8.8.8.8', '8.8.4.4'],
  listenAddress: '0.0.0.0',
  cacheSize: 1000,
};

/**
 * 读取记录文件
 */
async function loadRecords(): Promise<DnsRecord[]> {
  try {
    const raw = await fs.readFile(RECORDS_FILE, 'utf-8');
    return JSON.parse(raw) as DnsRecord[];
  } catch {
    return [];
  }
}

/**
 * 写入记录文件
 */
async function saveRecords(records: DnsRecord[]): Promise<void> {
  await ensureDir(DNS_DIR);
  await fs.writeFile(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

/**
 * 读取配置文件
 */
async function loadConfig(): Promise<DnsConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as DnsConfig;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 写入配置文件
 */
async function saveConfig(config: DnsConfig): Promise<void> {
  await ensureDir(DNS_DIR);
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 获取 dnsmasq 服务状态
 */
export async function getStatus(): Promise<DnsStatus> {
  let running = false;
  let pid: number | null = null;
  let version: string | null = null;

  // 检查进程
  const pgrepResult = await executeCommand('pgrep', ['-x', 'dnsmasq']);
  if (pgrepResult.exitCode === 0 && pgrepResult.stdout.trim()) {
    running = true;
    pid = parseInt(pgrepResult.stdout.trim().split('\n')[0] ?? '0', 10);
  }

  // 获取版本
  if (running) {
    const versionResult = await executeCommand('dnsmasq', ['--version']);
    if (versionResult.exitCode === 0) {
      const firstLine = versionResult.stdout.split('\n')[0];
      version = firstLine ?? null;
    }
  }

  return { running, pid, version };
}

/**
 * 获取自定义 DNS 记录列表
 */
export async function listRecords(): Promise<DnsRecord[]> {
  return loadRecords();
}

/**
 * 添加 DNS 记录
 */
export async function addRecord(req: CreateDnsRecordRequest): Promise<DnsResult> {
  const records = await loadRecords();

  // 检查重复
  const duplicate = records.find(
    (r) => r.type === req.type && r.name === req.name,
  );
  if (duplicate) {
    throw AppError.conflict(
      `DNS 记录已存在: ${req.type} ${req.name} → ${duplicate.value}`,
    );
  }

  const id = crypto.randomUUID().slice(0, 8);
  const record: DnsRecord = {
    id,
    type: req.type,
    name: req.name,
    value: req.value,
    ttl: req.ttl ?? DEFAULT_TTL,
    createdAt: new Date().toISOString(),
  };

  records.push(record);
  await saveRecords(records);

  return {
    recordId: id,
    message: `DNS 记录已添加: ${req.type} ${req.name} → ${req.value}`,
  };
}

/**
 * 删除 DNS 记录
 */
export async function deleteRecord(id: string): Promise<DnsResult> {
  const records = await loadRecords();
  const index = records.findIndex((r) => r.id === id);

  if (index === -1) {
    throw AppError.notFound(`DNS 记录 ${id}`);
  }

  const removed = records.splice(index, 1)[0];
  await saveRecords(records);

  return {
    recordId: id,
    message: `DNS 记录已删除: ${removed ? `${removed.type} ${removed.name}` : id}`,
  };
}

/**
 * 获取 DNS 配置
 */
export async function getConfig(): Promise<DnsConfig> {
  return loadConfig();
}

/**
 * 更新 DNS 配置
 */
export async function updateConfig(req: UpdateDnsConfigRequest): Promise<DnsConfig> {
  const config = await loadConfig();

  config.upstreamServers = req.upstreamServers;
  if (req.listenAddress !== undefined) {
    config.listenAddress = req.listenAddress;
  }
  if (req.cacheSize !== undefined) {
    config.cacheSize = req.cacheSize;
  }

  await saveConfig(config);

  // 生成 dnsmasq 配置片段
  await generateDnsmasqConfig(config);

  return config;
}

/**
 * 生成 dnsmasq 配置文件
 */
async function generateDnsmasqConfig(config: DnsConfig): Promise<void> {
  const records = await loadRecords();
  const lines: string[] = [
    '# Vibe OS 自动生成的 dnsmasq 配置',
    `listen-address=${config.listenAddress}`,
    `cache-size=${config.cacheSize}`,
    'no-resolv',
  ];

  for (const server of config.upstreamServers) {
    lines.push(`server=${server}`);
  }

  for (const record of records) {
    switch (record.type) {
      case 'A':
        lines.push(`address=/${record.name}/${record.value}`);
        break;
      case 'CNAME':
        lines.push(`cname=${record.name},${record.value}`);
        break;
      case 'PTR':
        lines.push(`ptr-record=${record.name},${record.value}`);
        break;
    }
  }

  const configPath = path.join(DNS_DIR, 'dnsmasq.conf');
  await ensureDir(DNS_DIR);
  await fs.writeFile(configPath, lines.join('\n') + '\n', 'utf-8');
}
