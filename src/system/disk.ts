/**
 * 磁盘健康检测封装
 * 通过 smartctl 获取 SMART 数据，lsblk 获取块设备列表
 */
import { executeCommand } from './command-executor.js';
import type { DiskHealthInfo, BlockDeviceInfo } from '../modules/hardware/hardware.types.js';

/**
 * 获取所有块设备列表
 * @returns 块设备信息数组
 */
export async function listBlockDevices(): Promise<BlockDeviceInfo[]> {
  const result = await executeCommand('lsblk', [
    '-J',
    '-o',
    'NAME,SIZE,TYPE,MOUNTPOINT,MODEL,SERIAL,TRAN',
    '--bytes',
  ]);

  if (result.exitCode !== 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(result.stdout) as {
      blockdevices?: Array<Record<string, string | null>>;
    };
    return (parsed.blockdevices ?? [])
      .filter((d) => d['type'] === 'disk')
      .map((d) => ({
        name: d['name'] ?? '',
        sizeBytes: BigInt(d['size'] ?? '0'),
        type: d['type'] ?? 'disk',
        mountPoint: d['mountpoint'] ?? null,
        model: d['model'] ?? null,
        serial: d['serial'] ?? null,
        transport: d['tran'] ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * 获取单个磁盘的 SMART 健康信息
 * @param device - 设备路径，如 /dev/sda
 * @returns 磁盘健康信息
 */
export async function getDiskSmartInfo(
  device: string,
): Promise<DiskHealthInfo> {
  // 基本健康状态
  const healthResult = await executeCommand('smartctl', [
    '-H',
    device,
  ]);

  // 详细 SMART 属性（JSON 格式）
  const attrResult = await executeCommand('smartctl', [
    '-A',
    '-j',
    device,
  ]);

  const isHealthy = healthResult.stdout.includes('PASSED');

  const attributes: Record<string, { value: number; worst: number; thresh: number; raw: number }> = {};
  let temperature: number | null = null;
  let powerOnHours: number | null = null;

  if (attrResult.exitCode === 0) {
    try {
      const parsed = JSON.parse(attrResult.stdout) as {
        ata_smart_attributes?: {
          table?: Array<{
            id: number;
            name: string;
            value: number;
            worst: number;
            thresh: number;
            raw: { value: number };
          }>;
        };
        temperature?: { current: number };
        power_on_time?: { hours: number };
      };

      if (parsed.ata_smart_attributes?.table) {
        for (const attr of parsed.ata_smart_attributes.table) {
          attributes[attr.name] = {
            value: attr.value,
            worst: attr.worst,
            thresh: attr.thresh,
            raw: attr.raw.value,
          };
        }
      }
      temperature = parsed.temperature?.current ?? null;
      powerOnHours = parsed.power_on_time?.hours ?? null;
    } catch {
      // JSON 解析失败，返回基本健康状态
    }
  }

  return {
    device,
    healthy: isHealthy,
    temperature,
    powerOnHours,
    attributes,
    rawOutput: healthResult.stdout,
  };
}

/**
 * 获取所有磁盘的健康状态
 */
export async function getAllDiskHealth(): Promise<DiskHealthInfo[]> {
  const devices = await listBlockDevices();
  const results: DiskHealthInfo[] = [];

  for (const dev of devices) {
    const devicePath = `/dev/${dev.name}`;
    try {
      const info = await getDiskSmartInfo(devicePath);
      results.push(info);
    } catch {
      results.push({
        device: devicePath,
        healthy: false,
        temperature: null,
        powerOnHours: null,
        attributes: {},
        rawOutput: `无法读取 ${devicePath} 的 SMART 数据`,
      });
    }
  }

  return results;
}
