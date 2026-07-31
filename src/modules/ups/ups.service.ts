/**
 * 模块：UPS 电源管理（NUT） — 业务逻辑层
 * 通过 upsc 命令读取 UPS 状态，配置/历史持久化到 JSON 文件
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import { executeCommand } from '../../system/command-executor.js';
import { AppError } from '../../common/app-error.js';
import type {
  UpsStatus,
  UpsConfig,
  UpsEvent,
  UpdateUpsConfigRequest,
  TestShutdownResult,
} from './ups.types.js';

const UPS_DIR = path.join(VIBEOS_APP_DIR, 'ups');
const CONFIG_FILE = path.join(UPS_DIR, 'config.json');
const HISTORY_FILE = path.join(UPS_DIR, 'history.json');

/** 默认 UPS 设备名（NUT 约定） */
const DEFAULT_UPS_NAME = 'ups';

/** 默认配置 */
const DEFAULT_CONFIG: UpsConfig = {
  shutdownThreshold: 20,
  notifyEmail: null,
};

/** 解析 upsc 输出为键值对 */
function parseUpscOutput(output: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of output.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

/** 安全解析浮点数 */
function parseFloatSafe(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

/** 读取配置（不存在则返回默认值） */
async function loadConfig(): Promise<UpsConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UpsConfig>;
    return {
      shutdownThreshold:
        typeof parsed.shutdownThreshold === 'number'
          ? parsed.shutdownThreshold
          : DEFAULT_CONFIG.shutdownThreshold,
      notifyEmail:
        typeof parsed.notifyEmail === 'string' ? parsed.notifyEmail : null,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 保存配置 */
async function saveConfig(cfg: UpsConfig): Promise<void> {
  await ensureDir(UPS_DIR);
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

/** 读取事件历史 */
async function loadHistory(): Promise<UpsEvent[]> {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UpsEvent[]) : [];
  } catch {
    return [];
  }
}

/** 追加事件到历史 */
async function appendEvent(event: UpsEvent): Promise<void> {
  await ensureDir(UPS_DIR);
  const history = await loadHistory();
  history.push(event);
  // 保留最近 500 条
  const trimmed = history.length > 500 ? history.slice(-500) : history;
  await fs.writeFile(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
}

/** GET /api/ups/status — 获取 UPS 实时状态 */
export async function getStatus(): Promise<UpsStatus> {
  const result = await executeCommand('upsc', [DEFAULT_UPS_NAME]);

  if (result.exitCode !== 0) {
    throw AppError.internal(
      `无法读取 UPS 状态: ${result.stderr || `退出码 ${result.exitCode}`}`,
    );
  }

  const vars = parseUpscOutput(result.stdout);
  const rawStatus = vars.get('ups.status') ?? null;

  return {
    name: vars.get('ups.name') ?? DEFAULT_UPS_NAME,
    batteryCharge: parseFloatSafe(vars.get('battery.charge')),
    load: parseFloatSafe(vars.get('ups.load')),
    inputVoltage: parseFloatSafe(vars.get('input.voltage')),
    runtime: parseFloatSafe(vars.get('ups.runtime')),
    online: rawStatus !== null && rawStatus.includes('OL'),
    rawStatus,
  };
}

/** GET /api/ups/config — 获取当前配置 */
export async function getConfig(): Promise<UpsConfig> {
  return loadConfig();
}

/** PUT /api/ups/config — 更新配置 */
export async function updateConfig(
  req: UpdateUpsConfigRequest,
): Promise<UpsConfig> {
  const cfg: UpsConfig = {
    shutdownThreshold: req.shutdownThreshold,
    notifyEmail: req.notifyEmail ?? null,
  };
  await saveConfig(cfg);

  // 记录配置变更事件
  await appendEvent({
    timestamp: new Date().toISOString(),
    type: 'info',
    message: `配置已更新: 关机阈值=${cfg.shutdownThreshold}%, 通知邮箱=${cfg.notifyEmail ?? '无'}`,
  });

  return cfg;
}

/** POST /api/ups/test-shutdown — 模拟关机测试（仅记录日志） */
export async function testShutdown(): Promise<TestShutdownResult> {
  const event: UpsEvent = {
    timestamp: new Date().toISOString(),
    type: 'test',
    message: '模拟关机测试已执行（未真正关机）',
  };
  await appendEvent(event);
  return { recorded: true, event };
}

/** GET /api/ups/history — 获取事件历史 */
export async function getHistory(): Promise<UpsEvent[]> {
  return loadHistory();
}
