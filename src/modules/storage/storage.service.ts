/**
 * 模块：存储池管理 — 业务逻辑层
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DATA_ROOT, VIBEOS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import type { PhysicalDisk, StoragePoolInfo, DiskSmartDetail, ScrubStatus } from './storage.types.js';

const POOLS_DIR = `${DATA_ROOT}/pools`;
const AUDIT_LOG = `${VIBEOS_APP_DIR}/logs/storage-audit.log`;

/** 写入审计日志 */
async function auditLog(action: string, detail: string): Promise<void> {
  const dir = path.dirname(AUDIT_LOG);
  await fs.mkdir(dir, { recursive: true });
  const line = `${new Date().toISOString()} [${action}] ${detail}\n`;
  await fs.appendFile(AUDIT_LOG, line, 'utf-8');
}

/**
 * 列出所有物理磁盘
 */
export async function listDisks(): Promise<PhysicalDisk[]> {
  const result = await executeCommand('lsblk', ['-J', '-o', 'NAME,SIZE,TYPE,MOUNTPOINT,MODEL,SERIAL,FSTYPE', '--bytes']);
  if (result.exitCode !== 0) return [];

  try {
    const parsed = JSON.parse(result.stdout) as { blockdevices?: Array<Record<string, string | null>> };
    return (parsed.blockdevices ?? [])
      .filter((d) => d['type'] === 'disk')
      .map((d) => ({
        device: `/dev/${d['name'] ?? ''}`,
        model: d['model'] ?? '',
        serial: d['serial'] ?? '',
        sizeBytes: parseInt(d['size'] ?? '0', 10),
        fsType: d['fstype'] ?? null,
        mountPoint: d['mountpoint'] ?? null,
        inPool: null,
        smart: { healthy: true, temperature: null, powerOnHours: null },
      }));
  } catch {
    return [];
  }
}

/**
 * 列出所有存储池
 */
export async function listPools(): Promise<StoragePoolInfo[]> {
  const result = await executeCommand('mdadm', ['--detail', '--scan']);
  const pools: StoragePoolInfo[] = [];

  if (result.exitCode === 0 && result.stdout.trim()) {
    const lines = result.stdout.trim().split('\n');
    for (const line of lines) {
      const nameMatch = line.match(/\/dev\/md\/(\S+)/);
      const levelMatch = line.match(/level=(\S+)/);
      if (nameMatch) {
        const name = nameMatch[1] ?? '';
        const mountPoint = `${POOLS_DIR}/${name}`;
        let totalBytes = 0, usedBytes = 0, freeBytes = 0, usedPercent = 0;
        let state: StoragePoolInfo['state'] = 'active';

        // 获取挂载信息
        const dfResult = await executeCommand('df', ['--output=size,used,avail,pcent', '-B1', mountPoint]);
        if (dfResult.exitCode === 0) {
          const dfLines = dfResult.stdout.trim().split('\n');
          const vals = (dfLines[1] ?? '').trim().split(/\s+/);
          totalBytes = parseInt(vals[0] ?? '0', 10);
          usedBytes = parseInt(vals[1] ?? '0', 10);
          freeBytes = parseInt(vals[2] ?? '0', 10);
          usedPercent = parseInt((vals[3] ?? '0').replace('%', ''), 10);
        } else {
          state = 'inactive';
        }

        pools.push({
          name,
          level: levelMatch?.[1] ?? 'unknown',
          devices: [],
          totalBytes,
          usedBytes,
          freeBytes,
          usedPercent,
          mountPoint,
          state,
        });
      }
    }
  }
  return pools;
}

/**
 * 创建存储池
 */
export async function createPool(name: string, level: string, disks: string[]): Promise<StoragePoolInfo> {
  // 校验磁盘不是系统盘
  const lsResult = await executeCommand('lsblk', ['-J', '-o', 'NAME,MOUNTPOINT']);
  if (lsResult.exitCode === 0) {
    try {
      const parsed = JSON.parse(lsResult.stdout) as { blockdevices?: Array<{ name: string; mountpoint?: string | null; children?: Array<{ mountpoint?: string | null }> }> };
      for (const bd of parsed.blockdevices ?? []) {
        const isSystem = bd.mountpoint === '/' || (bd.children ?? []).some((c) => c.mountpoint === '/');
        const devName = `/dev/${bd.name}`;
        if (isSystem && disks.includes(devName)) {
          throw AppError.forbidden(`禁止对系统盘 [${devName}] 执行写操作`);
        }
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
    }
  }

  const mdDevice = `/dev/md/${name}`;
  const mountPoint = `${POOLS_DIR}/${name}`;

  // 创建 RAID
  const mdadmArgs = ['--create', mdDevice, `--level=${level}`, `--raid-devices=${disks.length}`, ...disks, '--run'];
  await executeCommandStrict('mdadm', mdadmArgs, 300000);

  // 格式化
  await executeCommandStrict('mkfs.ext4', ['-F', mdDevice], 300000);

  // 挂载
  await fs.mkdir(mountPoint, { recursive: true });
  await executeCommandStrict('mount', [mdDevice, mountPoint]);

  await auditLog('CREATE_POOL', `name=${name} level=${level} disks=${disks.join(',')}`);

  return {
    name,
    level,
    devices: disks,
    totalBytes: 0,
    usedBytes: 0,
    freeBytes: 0,
    usedPercent: 0,
    mountPoint,
    state: 'active',
  };
}

/**
 * 销毁存储池
 */
export async function destroyPool(name: string): Promise<string> {
  const mdDevice = `/dev/md/${name}`;
  const mountPoint = `${POOLS_DIR}/${name}`;

  await executeCommand('umount', [mountPoint]);
  await executeCommandStrict('mdadm', ['--stop', mdDevice]);

  await auditLog('DESTROY_POOL', `name=${name}`);
  return name;
}

/**
 * 扩展存储池
 */
export async function expandPool(name: string, disks: string[]): Promise<StoragePoolInfo> {
  const mdDevice = `/dev/md/${name}`;
  for (const disk of disks) {
    await executeCommandStrict('mdadm', ['--add', mdDevice, disk]);
  }
  await executeCommandStrict('mdadm', ['--grow', mdDevice, `--raid-devices=${disks.length}`, '--backup-file=/tmp/mdadm-backup']);
  await auditLog('EXPAND_POOL', `name=${name} disks=${disks.join(',')}`);

  const pools = await listPools();
  const pool = pools.find((p) => p.name === name);
  if (!pool) throw AppError.notFound(`存储池 [${name}]`);
  return pool;
}

/**
 * 获取池内磁盘 SMART 详情
 */
export async function getPoolSmart(name: string): Promise<DiskSmartDetail[]> {
  const pools = await listPools();
  const pool = pools.find((p) => p.name === name);
  if (!pool) throw AppError.notFound(`存储池 [${name}]`);

  const details: DiskSmartDetail[] = [];
  for (const device of pool.devices) {
    const result = await executeCommand('smartctl', ['-A', '-j', device]);
    const detail: DiskSmartDetail = { device, healthy: false, temperature: null, powerOnHours: null, attributes: {} };
    if (result.exitCode === 0) {
      try {
        const parsed = JSON.parse(result.stdout) as {
          ata_smart_attributes?: { table?: Array<{ id: number; name: string; value: number; worst: number; thresh: number; raw: { value: number } }> };
          temperature?: { current: number };
          power_on_time?: { hours: number };
        };
        detail.healthy = true;
        detail.temperature = parsed.temperature?.current ?? null;
        detail.powerOnHours = parsed.power_on_time?.hours ?? null;
        if (parsed.ata_smart_attributes?.table) {
          for (const attr of parsed.ata_smart_attributes.table) {
            detail.attributes[attr.name] = { value: attr.value, worst: attr.worst, thresh: attr.thresh, raw: attr.raw.value };
          }
        }
      } catch { /* keep defaults */ }
    }
    details.push(detail);
  }
  return details;
}

/**
 * 启动 scrub
 */
export async function startScrub(name: string): Promise<{ started: boolean; estimatedHours?: number }> {
  const mdDevice = `/dev/md/${name}`;
  await executeCommandStrict('mdadm', ['--action', 'check', mdDevice]);
  await auditLog('SCRUB_START', `pool=${name}`);
  return { started: true };
}

/**
 * 获取 scrub 状态
 */
export async function getScrubStatus(name: string): Promise<ScrubStatus> {
  const result = await executeCommand('mdadm', ['--detail', `/dev/md/${name}`]);
  if (result.exitCode !== 0) return { running: false };

  const progressMatch = result.stdout.match(/Rebuild Status\s*:\s*(\d+)%/);
  if (progressMatch) {
    return { running: true, progress: parseInt(progressMatch[1] ?? '0', 10), errors: 0 };
  }
  return { running: false };
}
