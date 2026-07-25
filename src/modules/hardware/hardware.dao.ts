/**
 * 模块2：硬件健康与驱动状态监控 — 数据访问层
 * 封装 smartctl、ethtool、lspci、lsmod 等系统工具的底层调用
 */
import {
  getAllDiskHealth,
  listBlockDevices,
} from '../../system/disk.js';
import {
  detectNetworkDrivers,
  getInterfaceInfo,
} from '../../system/network.js';
import { executeCommand } from '../../system/command-executor.js';
import type {
  DiskHealthInfo,
  BlockDeviceInfo,
  NetworkDriverInfo,
  NetworkInterfaceInfo,
} from './hardware.types.js';

/**
 * 获取所有磁盘的 SMART 健康数据
 * @returns 磁盘健康信息数组
 */
export async function fetchAllDiskHealth(): Promise<DiskHealthInfo[]> {
  return getAllDiskHealth();
}

/**
 * 获取所有块设备列表
 * @returns 块设备信息数组
 */
export async function fetchBlockDevices(): Promise<BlockDeviceInfo[]> {
  return listBlockDevices();
}

/**
 * 检测所有已知网卡驱动的加载状态
 * @returns 网卡驱动信息数组
 */
export async function fetchNetworkDrivers(): Promise<NetworkDriverInfo[]> {
  return detectNetworkDrivers();
}

/**
 * 获取指定网络接口的链路状态
 * @param interfaceName - 接口名（如 eth0, enp3s0）
 * @returns 接口信息
 */
export async function fetchInterfaceInfo(
  interfaceName: string,
): Promise<NetworkInterfaceInfo> {
  return getInterfaceInfo(interfaceName);
}

/**
 * 枚举系统中所有网络接口名称
 * 通过 ip link 命令获取
 * @returns 接口名列表
 */
export async function listNetworkInterfaces(): Promise<string[]> {
  const result = await executeCommand('ip', ['-o', 'link', 'show']);
  if (result.exitCode !== 0) return [];

  const interfaces: string[] = [];
  const lines = result.stdout.trim().split('\n');
  for (const line of lines) {
    // 格式: "2: eth0: <BROADCAST,...> mtu 1500 ..."
    const match = line.match(/^\d+:\s+(\S+?)(?:@\S+)?:/);
    if (match?.[1] && match[1] !== 'lo') {
      interfaces.push(match[1]);
    }
  }
  return interfaces;
}
