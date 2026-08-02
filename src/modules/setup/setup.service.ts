/**
 * 模块：安装向导 — 服务层
 * 磁盘发现、系统初始化、标记文件创建
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DATA_ROOT } from '../../config.js';
import { ensureDir } from '../../system/filesystem.js';
import { executeCommand } from '../../system/command-executor.js';
import { AppError } from '../../common/app-error.js';
import type { SetupDisk, SetupCompleteRequest } from './setup.types.js';

const INIT_MARKER = path.join(DATA_ROOT, '.initialized');

/** 检查是否已初始化 */
export async function isInitialized(): Promise<boolean> {
  try {
    await fs.access(INIT_MARKER);
    return true;
  } catch {
    return false;
  }
}

/** GET /api/setup/disks — 发现可用磁盘 */
export async function listDisks(): Promise<SetupDisk[]> {
  const result = await executeCommand('lsblk', [
    '-dnpo', 'NAME,SIZE,MODEL',
  ]);
  if (result.exitCode !== 0) return [];

  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const name = parts[0] ?? '';
      const sizeBytes = Number(parts[1] ?? 0);
      const model = parts.slice(2).join(' ') || 'Unknown';
      // 过滤掉 loop/ram 设备
      if (name.includes('/loop') || name.includes('/ram')) return null;
      const sizeGb = (sizeBytes / 1073741824).toFixed(0);
      return { name: path.basename(name), size: `${sizeGb} GB`, model };
    })
    .filter((d): d is SetupDisk => d !== null);
}

/** POST /api/setup/complete — 完成初始化 */
export async function complete(req: SetupCompleteRequest): Promise<void> {
  const already = await isInitialized();
  if (already) throw AppError.conflict('系统已初始化');

  // 1. 创建数据目录结构
  await ensureDir(DATA_ROOT);
  await ensureDir(path.join(DATA_ROOT, 'vibeos', 'secrets'));

  // 2. 存储池（仅记录配置，实际格式化由系统层处理）
  const storageConf = {
    disks: req.storage.disks,
    poolType: req.storage.poolType,
    filesystem: req.storage.filesystem,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(DATA_ROOT, 'vibeos', 'storage-pool.json'),
    JSON.stringify(storageConf, null, 2),
    'utf-8',
  );

  // 3. 网络配置
  if (req.network.method === 'static' && req.network.ip) {
    await executeCommand('ip', ['addr', 'flush', 'dev', 'eth0']);
    await executeCommand('ip', ['addr', 'add', `${req.network.ip}/${req.network.netmask ?? '24'}`, 'dev', 'eth0']);
    if (req.network.gateway) {
      await executeCommand('ip', ['route', 'add', 'default', 'via', req.network.gateway]);
    }
  }

  // 4. 服务启用记录
  const servicesConf = {
    ...req.services,
    configuredAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(DATA_ROOT, 'vibeos', 'services.json'),
    JSON.stringify(servicesConf, null, 2),
    'utf-8',
  );

  // 5. 创建初始化标记
  await fs.writeFile(INIT_MARKER, new Date().toISOString(), 'utf-8');
}
