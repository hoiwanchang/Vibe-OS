/**
 * 模块：RAID 阵列管理 — 业务逻辑层
 * 所有 mdadm 命令通过 executeCommand / executeCommandStrict 执行
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { VIBEOS_APP_DIR } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import type { RaidArraySummary, RaidArrayDetail, RaidLevel, RaidState } from './raid.types.js';

const AUDIT_LOG = `${VIBEOS_APP_DIR}/logs/raid-audit.log`;

/** 写入审计日志 */
async function auditLog(action: string, detail: string): Promise<void> {
  const dir = path.dirname(AUDIT_LOG);
  await fs.mkdir(dir, { recursive: true });
  const line = `${new Date().toISOString()} [${action}] ${detail}\n`;
  await fs.appendFile(AUDIT_LOG, line, 'utf-8');
}

/** 从 mdadm --detail 输出中解析阵列状态 */
function parseState(stdout: string): RaidState {
  const stateMatch = stdout.match(/State\s*:\s*(.+)/i);
  const stateLine = (stateMatch?.[1] ?? '').toLowerCase();
  const rebuildMatch = stdout.match(/Rebuild Status\s*:\s*\d+%/i);

  if (rebuildMatch) return 'rebuilding';
  if (stateLine.includes('degraded')) return 'degraded';
  if (stateLine.includes('clean') || stateLine.includes('active')) return 'online';
  if (stateLine.includes('inactive')) return 'inactive';
  // 无法识别时，若命令成功则默认 online
  return 'online';
}

/** 从 mdadm --detail 输出中解析同步进度 */
function parseSyncProgress(stdout: string): number | null {
  const match = stdout.match(/Rebuild Status\s*:\s*(\d+)%/i);
  return match ? parseInt(match[1] ?? '0', 10) : null;
}

/** 从 mdadm --detail 输出中解析成员盘列表 */
function parseDevices(stdout: string): { devices: string[]; spares: string[] } {
  const devices: string[] = [];
  const spares: string[] = [];
  // 成员盘行格式: "   0       8       16        0      active sync   /dev/sdb"
  const lines = stdout.split('\n');
  let inDeviceTable = false;
  for (const line of lines) {
    if (/Number\s+Major\s+Minor\s+RaidDevice\s+State/i.test(line)) {
      inDeviceTable = true;
      continue;
    }
    if (inDeviceTable) {
      const devMatch = line.match(/(\/dev\/\S+)\s*$/);
      if (devMatch) {
        const dev = devMatch[1] ?? '';
        if (/spare/i.test(line)) {
          spares.push(dev);
        } else {
          devices.push(dev);
        }
      } else if (line.trim() === '') {
        // 空行可能表示表格结束，但也可能只是间隔，继续
      }
    }
  }
  return { devices, spares };
}

/** 从 mdadm --detail 输出中解析容量（Array Size 行） */
function parseArraySize(stdout: string): number {
  // "Array Size : 1953254400 (1862.75 GiB 2000.13 GB)"
  const match = stdout.match(/Array Size\s*:\s*(\d+)/i);
  if (match) {
    // mdadm 报告的 Array Size 单位是 KiB
    return parseInt(match[1] ?? '0', 10) * 1024;
  }
  return 0;
}

/**
 * 列出所有 RAID 阵列
 * 解析 mdadm --detail --scan 输出
 */
export async function listArrays(): Promise<RaidArraySummary[]> {
  const result = await executeCommand('mdadm', ['--detail', '--scan']);
  const arrays: RaidArraySummary[] = [];

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return arrays;
  }

  const lines = result.stdout.trim().split('\n');
  for (const line of lines) {
    // ARRAY /dev/md/data metadata=1.2 name=host:data UUID=xxx
    // 或 ARRAY /dev/md/data level=raid5 num-devices=3
    const deviceMatch = line.match(/ARRAY\s+(\/dev\/md\/\S+)/);
    if (!deviceMatch) continue;

    const device = deviceMatch[1] ?? '';
    const name = device.replace('/dev/md/', '');

    const levelMatch = line.match(/level=(\S+)/);
    const level = (levelMatch?.[1] ?? 'unknown') as RaidLevel | 'unknown';

    const numDevMatch = line.match(/num-devices=(\d+)/);
    const deviceCount = numDevMatch ? parseInt(numDevMatch[1] ?? '0', 10) : 0;

    // 获取详细状态
    let state: RaidState = 'online';
    const detailResult = await executeCommand('mdadm', ['--detail', device]);
    if (detailResult.exitCode === 0) {
      state = parseState(detailResult.stdout);
    } else {
      state = 'inactive';
    }

    arrays.push({ name, device, level, state, deviceCount });
  }

  return arrays;
}

/**
 * 创建 RAID 阵列
 */
export async function createArray(
  name: string,
  level: RaidLevel,
  devices: string[],
  spares: string[] = [],
): Promise<RaidArrayDetail> {
  const mdDevice = `/dev/md/${name}`;

  // 检查阵列是否已存在
  const scanResult = await executeCommand('mdadm', ['--detail', '--scan']);
  if (scanResult.exitCode === 0 && scanResult.stdout.includes(mdDevice)) {
    throw AppError.conflict(`RAID 阵列 [${name}] 已存在`);
  }

  // 构建 mdadm --create 命令
  const mdadmArgs = [
    '--create', mdDevice,
    `--level=${level}`,
    `--raid-devices=${devices.length}`,
    ...devices,
  ];

  if (spares.length > 0) {
    mdadmArgs.push(`--spare-devices=${spares.length}`, ...spares);
  }

  mdadmArgs.push('--run');

  await executeCommandStrict('mdadm', mdadmArgs, 300000);
  await auditLog('CREATE_RAID', `name=${name} level=${level} devices=${devices.join(',')} spares=${spares.join(',')}`);

  return getArrayDetail(name);
}

/**
 * 获取阵列详情
 */
export async function getArrayDetail(name: string): Promise<RaidArrayDetail> {
  const mdDevice = `/dev/md/${name}`;

  const result = await executeCommand('mdadm', ['--detail', mdDevice]);
  if (result.exitCode !== 0) {
    throw AppError.notFound(`RAID 阵列 [${name}]`);
  }

  const stdout = result.stdout;
  const state = parseState(stdout);
  const syncProgress = parseSyncProgress(stdout);
  const { devices, spares } = parseDevices(stdout);
  const totalBytes = parseArraySize(stdout);

  // 解析 level
  const levelMatch = stdout.match(/Raid Level\s*:\s*(\S+)/i);
  const rawLevel = (levelMatch?.[1] ?? 'unknown').toLowerCase();
  const level = (['raid0', 'raid1', 'raid5', 'raid6', 'raid10'].includes(rawLevel)
    ? rawLevel
    : 'unknown') as RaidLevel | 'unknown';

  // 获取文件系统使用情况（如果已格式化并挂载）
  let usedBytes = 0;
  let freeBytes = 0;
  const dfResult = await executeCommand('df', ['--output=used,avail', '-B1', mdDevice]);
  if (dfResult.exitCode === 0) {
    const dfLines = dfResult.stdout.trim().split('\n');
    const vals = (dfLines[1] ?? '').trim().split(/\s+/);
    usedBytes = parseInt(vals[0] ?? '0', 10);
    freeBytes = parseInt(vals[1] ?? '0', 10);
  }

  return {
    name,
    device: mdDevice,
    level,
    state,
    devices,
    spares,
    totalBytes,
    usedBytes,
    freeBytes,
    syncProgress,
  };
}

/**
 * 向阵列添加磁盘
 */
export async function addDevice(name: string, device: string): Promise<RaidArrayDetail> {
  const mdDevice = `/dev/md/${name}`;

  // 确认阵列存在
  const checkResult = await executeCommand('mdadm', ['--detail', mdDevice]);
  if (checkResult.exitCode !== 0) {
    throw AppError.notFound(`RAID 阵列 [${name}]`);
  }

  await executeCommandStrict('mdadm', ['--add', mdDevice, device]);
  await auditLog('ADD_DEVICE', `array=${name} device=${device}`);

  return getArrayDetail(name);
}

/**
 * 从阵列移除磁盘
 * 先标记为 faulty，再 remove
 */
export async function removeDevice(name: string, device: string): Promise<RaidArrayDetail> {
  const mdDevice = `/dev/md/${name}`;

  // 确认阵列存在
  const checkResult = await executeCommand('mdadm', ['--detail', mdDevice]);
  if (checkResult.exitCode !== 0) {
    throw AppError.notFound(`RAID 阵列 [${name}]`);
  }

  // 标记为故障盘
  await executeCommandStrict('mdadm', ['--manage', mdDevice, '--fail', device]);
  // 移除
  await executeCommandStrict('mdadm', ['--manage', mdDevice, '--remove', device]);
  await auditLog('REMOVE_DEVICE', `array=${name} device=${device}`);

  return getArrayDetail(name);
}

/**
 * 触发阵列重建
 * 通过写入 md sync_action 触发 repair/check
 */
export async function rebuildArray(name: string): Promise<{ started: boolean; message: string }> {
  const mdDevice = `/dev/md/${name}`;

  // 确认阵列存在
  const checkResult = await executeCommand('mdadm', ['--detail', mdDevice]);
  if (checkResult.exitCode !== 0) {
    throw AppError.notFound(`RAID 阵列 [${name}]`);
  }

  // 从设备路径提取 md 编号，如 /dev/md/data -> 查找对应的 /sys/block/mdX
  // 使用 mdadm --action=repair 触发重建
  await executeCommandStrict('mdadm', ['--action', 'repair', mdDevice]);
  await auditLog('REBUILD', `array=${name}`);

  return { started: true, message: `阵列 [${name}] 重建已触发` };
}

/**
 * 删除阵列
 * 先卸载（如果已挂载），再停止阵列
 */
export async function deleteArray(name: string): Promise<{ deleted: boolean; name: string }> {
  const mdDevice = `/dev/md/${name}`;

  // 确认阵列存在
  const checkResult = await executeCommand('mdadm', ['--detail', mdDevice]);
  if (checkResult.exitCode !== 0) {
    throw AppError.notFound(`RAID 阵列 [${name}]`);
  }

  // 尝试卸载（忽略失败，可能未挂载）
  await executeCommand('umount', [mdDevice]);

  // 停止阵列
  await executeCommandStrict('mdadm', ['--stop', mdDevice]);

  // 擦除超级块（防止重新组装）
  const detail = parseDevices(checkResult.stdout);
  for (const dev of [...detail.devices, ...detail.spares]) {
    await executeCommand('wipefs', ['--all', dev]);
  }

  await auditLog('DELETE_RAID', `name=${name}`);

  return { deleted: true, name };
}
