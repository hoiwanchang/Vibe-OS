/**
 * 模块：应用自动更新 — 业务逻辑层
 * 配置 / 可用更新 / 历史持久化到 JSON 文件
 * 所有系统命令通过 executeCommand 执行
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { VIBEOS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { ensureDir } from '../../system/filesystem.js';
import { executeCommand } from '../../system/command-executor.js';
import type {
  AvailableUpdate,
  UpdateConfig,
  UpdateHistoryEntry,
  UpdateStatus,
} from './appupdate.types.js';

/* ---------- 持久化路径 ---------- */

const CONFIG_FILE = path.join(VIBEOS_APP_DIR, 'appupdate', 'config.json');
const AVAILABLE_FILE = path.join(VIBEOS_APP_DIR, 'appupdate', 'available.json');
const HISTORY_FILE = path.join(VIBEOS_APP_DIR, 'appupdate', 'history.json');

/* ---------- 持久化辅助 ---------- */

async function loadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function saveJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

const DEFAULT_CONFIG: UpdateConfig = {
  mode: 'manual',
  lastCheckAt: null,
};

async function loadConfig(): Promise<UpdateConfig> {
  return loadJson<UpdateConfig>(CONFIG_FILE, { ...DEFAULT_CONFIG });
}

async function saveConfig(config: UpdateConfig): Promise<void> {
  await saveJson(CONFIG_FILE, config);
}

async function loadAvailable(): Promise<AvailableUpdate[]> {
  return loadJson<AvailableUpdate[]>(AVAILABLE_FILE, []);
}

async function saveAvailable(updates: AvailableUpdate[]): Promise<void> {
  await saveJson(AVAILABLE_FILE, updates);
}

async function loadHistory(): Promise<UpdateHistoryEntry[]> {
  return loadJson<UpdateHistoryEntry[]>(HISTORY_FILE, []);
}

async function saveHistory(history: UpdateHistoryEntry[]): Promise<void> {
  await saveJson(HISTORY_FILE, history);
}

/* ---------- 业务方法 ---------- */

/** 获取更新服务状态 */
export async function getStatus(): Promise<UpdateStatus> {
  const config = await loadConfig();
  const available = await loadAvailable();
  return {
    mode: config.mode,
    maintenanceWindow: config.maintenanceWindow ?? null,
    lastCheckAt: config.lastCheckAt,
    availableCount: available.length,
  };
}

/** 更新策略配置 */
export async function updateConfig(data: {
  mode: 'manual' | 'auto';
  maintenanceWindow?: string;
}): Promise<UpdateConfig> {
  const config = await loadConfig();
  config.mode = data.mode;
  if (data.maintenanceWindow !== undefined) {
    config.maintenanceWindow = data.maintenanceWindow;
  }
  await saveConfig(config);
  return config;
}

/**
 * 检查所有已安装应用的更新
 * 流程：docker ps 获取容器列表 → 逐一对比本地 / 远端镜像 ID
 */
export async function checkUpdates(): Promise<AvailableUpdate[]> {
  const psResult = await executeCommand('docker', [
    'ps', '--format', '{{.Names}}\t{{.Image}}',
  ]);
  if (psResult.exitCode !== 0) {
    throw AppError.internal('无法获取容器列表，请确认 Docker 服务正常运行');
  }

  const containers = psResult.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      return { name: parts[0] ?? '', image: parts[1] ?? '' };
    })
    .filter((c) => c.name !== '' && c.image !== '');

  const updates: AvailableUpdate[] = [];

  for (const container of containers) {
    try {
      // 获取当前本地镜像 ID
      const inspectBefore = await executeCommand('docker', [
        'inspect', '--format', '{{.Id}}', container.image,
      ]);
      const currentId =
        inspectBefore.exitCode === 0 ? inspectBefore.stdout.trim() : '';

      // 拉取远端最新镜像
      const pullResult = await executeCommand(
        'docker',
        ['pull', container.image],
        300_000,
      );
      if (pullResult.exitCode !== 0) continue;

      // 获取拉取后的镜像 ID
      const inspectAfter = await executeCommand('docker', [
        'inspect', '--format', '{{.Id}}', container.image,
      ]);
      const latestId =
        inspectAfter.exitCode === 0 ? inspectAfter.stdout.trim() : '';

      if (currentId !== '' && latestId !== '' && currentId !== latestId) {
        updates.push({
          appId: container.name,
          containerName: container.name,
          image: container.image,
          currentImageId: currentId,
          latestImageId: latestId,
          detectedAt: new Date().toISOString(),
        });
      }
    } catch {
      // 单个容器检查失败不影响整体
      continue;
    }
  }

  // 更新 lastCheckAt
  const config = await loadConfig();
  config.lastCheckAt = new Date().toISOString();
  await saveConfig(config);

  // 持久化可用更新
  await saveAvailable(updates);

  return updates;
}

/** 获取可用更新列表 */
export async function getAvailable(): Promise<AvailableUpdate[]> {
  return loadAvailable();
}

/**
 * 应用更新（docker pull + restart）
 * @param appId - 应用标识（容器名）
 */
export async function applyUpdate(
  appId: string,
): Promise<UpdateHistoryEntry> {
  const available = await loadAvailable();
  const update = available.find((u) => u.appId === appId);
  if (!update) {
    throw AppError.notFound(`可用更新 [${appId}]`);
  }

  const entry: UpdateHistoryEntry = {
    id: randomUUID(),
    appId: update.appId,
    containerName: update.containerName,
    image: update.image,
    previousImageId: update.currentImageId,
    newImageId: update.latestImageId,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    status: 'success',
  };

  try {
    // 拉取最新镜像
    const pullResult = await executeCommand(
      'docker',
      ['pull', update.image],
      300_000,
    );
    if (pullResult.exitCode !== 0) {
      throw new Error(`docker pull 失败: ${pullResult.stderr}`);
    }

    // 重启容器以使用新镜像
    const restartResult = await executeCommand('docker', [
      'restart',
      update.containerName,
    ]);
    if (restartResult.exitCode !== 0) {
      throw new Error(`docker restart 失败: ${restartResult.stderr}`);
    }
  } catch (err) {
    entry.status = 'failed';
    entry.error = err instanceof Error ? err.message : String(err);
  }

  entry.finishedAt = new Date().toISOString();

  // 写入历史（最新在前）
  const history = await loadHistory();
  history.unshift(entry);
  await saveHistory(history);

  // 从可用列表移除
  await saveAvailable(available.filter((u) => u.appId !== appId));

  return entry;
}

/** 获取更新历史 */
export async function getHistory(): Promise<UpdateHistoryEntry[]> {
  return loadHistory();
}
