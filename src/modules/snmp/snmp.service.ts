/**
 * 模块：SNMP 监控 — 服务层
 * snmpd 服务状态/控制、配置持久化、OID 数据采集与解析
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import { executeCommand } from '../../system/command-executor.js';
import { AppError } from '../../common/app-error.js';
import type {
  SnmpStatus,
  SnmpConfig,
  SnmpOidData,
  SnmpCpuData,
  SnmpMemoryData,
  SnmpDiskEntry,
  SnmpNetworkEntry,
  SnmpTemperatureEntry,
  SnmpActionResult,
} from './snmp.types.js';

const SNMP_DIR = path.join(VIBEOS_APP_DIR, 'snmp');
const CONFIG_FILE = path.join(SNMP_DIR, 'config.json');

/** 默认配置 */
const DEFAULT_CONFIG: SnmpConfig = {
  community: 'public',
  listenAddress: '0.0.0.0',
  enabledGroups: ['cpu', 'memory', 'disk', 'network', 'temperature'],
};

/** 合法 OID 组名 */
const VALID_GROUPS = new Set(['cpu', 'memory', 'disk', 'network', 'temperature']);

// ===== 配置持久化 =====

async function loadConfig(): Promise<SnmpConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SnmpConfig>;
    return {
      community: typeof parsed.community === 'string' ? parsed.community : DEFAULT_CONFIG.community,
      listenAddress: typeof parsed.listenAddress === 'string' ? parsed.listenAddress : DEFAULT_CONFIG.listenAddress,
      enabledGroups: Array.isArray(parsed.enabledGroups) ? parsed.enabledGroups : DEFAULT_CONFIG.enabledGroups,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(cfg: SnmpConfig): Promise<void> {
  await ensureDir(SNMP_DIR);
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

// ===== 服务状态与控制 =====

/** GET /api/snmp/status */
export async function getStatus(): Promise<SnmpStatus> {
  let running = false;
  try {
    const result = await executeCommand('systemctl', ['is-active', 'snmpd']);
    running = result.stdout.trim() === 'active';
  } catch {
    running = false;
  }
  return { running };
}

/** POST /api/snmp/start */
export async function startService(): Promise<SnmpActionResult> {
  const result = await executeCommand('systemctl', ['start', 'snmpd']);
  if (result.exitCode !== 0) {
    throw AppError.internal(`启动 snmpd 失败: ${result.stderr || '未知错误'}`);
  }
  return { message: 'snmpd 服务已启动' };
}

/** POST /api/snmp/stop */
export async function stopService(): Promise<SnmpActionResult> {
  const result = await executeCommand('systemctl', ['stop', 'snmpd']);
  if (result.exitCode !== 0) {
    throw AppError.internal(`停止 snmpd 失败: ${result.stderr || '未知错误'}`);
  }
  return { message: 'snmpd 服务已停止' };
}

/** POST /api/snmp/restart */
export async function restartService(): Promise<SnmpActionResult> {
  const result = await executeCommand('systemctl', ['restart', 'snmpd']);
  if (result.exitCode !== 0) {
    throw AppError.internal(`重启 snmpd 失败: ${result.stderr || '未知错误'}`);
  }
  return { message: 'snmpd 服务已重启' };
}

// ===== 配置管理 =====

/** GET /api/snmp/config */
export async function getConfig(): Promise<SnmpConfig> {
  return loadConfig();
}

/** PUT /api/snmp/config */
export async function updateConfig(
  community: string,
  listenAddress?: string,
  enabledGroups?: string[],
): Promise<SnmpConfig> {
  if (!community || typeof community !== 'string') {
    throw AppError.badRequest('INVALID_COMMUNITY', 'community 不能为空');
  }

  if (enabledGroups) {
    for (const g of enabledGroups) {
      if (!VALID_GROUPS.has(g)) {
        throw AppError.badRequest('INVALID_GROUP', `无效的 OID 组: ${g}`);
      }
    }
  }

  const cfg: SnmpConfig = {
    community,
    listenAddress: listenAddress ?? DEFAULT_CONFIG.listenAddress,
    enabledGroups: enabledGroups ?? DEFAULT_CONFIG.enabledGroups,
  };
  await saveConfig(cfg);
  return cfg;
}

// ===== OID 数据采集 =====

/** 执行 snmpwalk 并返回原始输出行 */
async function snmpwalk(community: string, oid: string): Promise<string[]> {
  const result = await executeCommand('snmpwalk', [
    '-v', '2c',
    '-c', community,
    'localhost',
    oid,
  ]);
  if (result.exitCode !== 0) {
    return [];
  }
  return result.stdout.split('\n').filter((line) => line.trim().length > 0);
}

/** 从 snmpwalk 行中提取值（STRING: / INTEGER: / Counter32: / Gauge32: 等） */
function extractValue(line: string): string {
  const match = line.match(/=\s*(?:STRING|INTEGER|Counter32|Gauge32|OID|Timeticks|IpAddress|Hex-STRING):\s*(.+)/i);
  return match ? (match[1] ?? '').trim().replace(/^"|"$/g, '') : '';
}

/** 解析 CPU 负载数据（UCD-SNMP-MIB laLoad） */
function parseCpuData(lines: string[]): SnmpCpuData {
  const loads: number[] = [];
  for (const line of lines) {
    if (line.includes('laLoad')) {
      const val = extractValue(line);
      const num = parseFloat(val);
      if (!isNaN(num)) {
        loads.push(num);
      }
    }
  }
  const averageLoad = loads.length > 0
    ? Math.round((loads.reduce((a, b) => a + b, 0) / loads.length) * 100) / 100
    : 0;
  return { loads, averageLoad };
}

/** 解析内存数据（UCD-SNMP-MIB memTable） */
function parseMemoryData(lines: string[]): SnmpMemoryData {
  let totalKb = 0;
  let availableKb = 0;

  for (const line of lines) {
    if (line.includes('memTotalReal')) {
      totalKb = parseInt(extractValue(line), 10) || 0;
    } else if (line.includes('memAvailReal')) {
      availableKb = parseInt(extractValue(line), 10) || 0;
    }
  }

  return {
    totalKb,
    usedKb: Math.max(0, totalKb - availableKb),
    availableKb,
  };
}

/** 解析磁盘数据（UCD-SNMP-MIB dskTable） */
function parseDiskData(lines: string[]): SnmpDiskEntry[] {
  const disks = new Map<string, { description: string; totalKb: number; usedKb: number }>();

  for (const line of lines) {
    // 提取索引号，如 dskDevice.1 / dskTotal.1
    const idxMatch = line.match(/\.(\d+)\s*=/);
    if (!idxMatch) continue;
    const idx = idxMatch[1] ?? '0';

    if (!disks.has(idx)) {
      disks.set(idx, { description: '', totalKb: 0, usedKb: 0 });
    }
    const entry = disks.get(idx)!;

    if (line.includes('dskDevice')) {
      entry.description = extractValue(line);
    } else if (line.includes('dskTotal')) {
      entry.totalKb = parseInt(extractValue(line), 10) || 0;
    } else if (line.includes('dskUsed')) {
      entry.usedKb = parseInt(extractValue(line), 10) || 0;
    }
  }

  return Array.from(disks.values()).filter((d) => d.description !== '');
}

/** 解析网络接口数据（IF-MIB ifTable） */
function parseNetworkData(lines: string[]): SnmpNetworkEntry[] {
  const interfaces = new Map<string, { name: string; inOctets: number; outOctets: number }>();

  for (const line of lines) {
    const idxMatch = line.match(/\.(\d+)\s*=/);
    if (!idxMatch) continue;
    const idx = idxMatch[1] ?? '0';

    if (!interfaces.has(idx)) {
      interfaces.set(idx, { name: '', inOctets: 0, outOctets: 0 });
    }
    const entry = interfaces.get(idx)!;

    if (line.includes('ifDescr')) {
      entry.name = extractValue(line);
    } else if (line.includes('ifInOctets')) {
      entry.inOctets = parseInt(extractValue(line), 10) || 0;
    } else if (line.includes('ifOutOctets')) {
      entry.outOctets = parseInt(extractValue(line), 10) || 0;
    }
  }

  return Array.from(interfaces.values()).filter((i) => i.name !== '');
}

/** 解析温度数据（lmSensors） */
function parseTemperatureData(lines: string[]): SnmpTemperatureEntry[] {
  const sensors: SnmpTemperatureEntry[] = [];

  for (const line of lines) {
    if (line.includes('lmTempSensorsDevice') || line.includes('lmTempSensorsValue')) {
      // 尝试匹配名称和值
      const valMatch = line.match(/=\s*(?:STRING|INTEGER|Gauge32):\s*(.+)/i);
      if (!valMatch) continue;
      const raw = (valMatch[1] ?? '').trim().replace(/^"|"$/g, '');

      if (line.includes('lmTempSensorsDevice')) {
        sensors.push({ name: raw, value: 0 });
      } else if (line.includes('lmTempSensorsValue')) {
        // 温度值可能带单位，如 "45000" (millidegrees) 或 "45.0"
        const num = parseFloat(raw);
        if (!isNaN(num) && sensors.length > 0) {
          // 如果值大于 1000，可能是毫摄氏度
          sensors[sensors.length - 1]!.value = num > 1000 ? Math.round(num / 1000 * 10) / 10 : num;
        }
      }
    }
  }

  return sensors;
}

/** OID 子树映射 */
const OID_SUBTREES: Record<string, string> = {
  cpu: '1.3.6.1.4.1.2021.10.1.3',
  memory: '1.3.6.1.4.1.2021.4',
  disk: '1.3.6.1.4.1.2021.9',
  network: '1.3.6.1.2.1.2.2',
  temperature: '1.3.6.1.4.1.2021.13.16',
};

/** GET /api/snmp/oids */
export async function getOidData(): Promise<SnmpOidData> {
  const cfg = await loadConfig();
  const enabled = new Set(cfg.enabledGroups);

  const emptyResult: SnmpOidData = {
    cpu: { loads: [], averageLoad: 0 },
    memory: { totalKb: 0, usedKb: 0, availableKb: 0 },
    disk: [],
    network: [],
    temperature: [],
  };

  // 并行采集所有启用的 OID 组
  const entries = Object.entries(OID_SUBTREES).filter(([group]) => enabled.has(group));
  const walkResults = await Promise.all(
    entries.map(async ([group, oid]) => {
      const lines = await snmpwalk(cfg.community, oid);
      return { group, lines };
    }),
  );

  const result = { ...emptyResult };
  for (const { group, lines } of walkResults) {
    switch (group) {
      case 'cpu':
        result.cpu = parseCpuData(lines);
        break;
      case 'memory':
        result.memory = parseMemoryData(lines);
        break;
      case 'disk':
        result.disk = parseDiskData(lines);
        break;
      case 'network':
        result.network = parseNetworkData(lines);
        break;
      case 'temperature':
        result.temperature = parseTemperatureData(lines);
        break;
    }
  }

  return result;
}
