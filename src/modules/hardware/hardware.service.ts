/**
 * 模块2：硬件健康与驱动状态监控 — 业务逻辑层
 * 聚合磁盘健康与网卡驱动数据，生成统一 API 响应
 */
import * as dao from './hardware.dao.js';
import type {
  DiskHealthResponse,
  NetworkDriversResponse,
} from './hardware.types.js';

/**
 * 获取磁盘健康综合报告
 * 合并 SMART 数据与块设备元信息
 * @returns 磁盘健康 API 响应
 */
export async function getDiskHealthReport(): Promise<DiskHealthResponse> {
  const [diskHealth, blockDevices] = await Promise.all([
    dao.fetchAllDiskHealth(),
    dao.fetchBlockDevices(),
  ]);

  // 构建块设备名称到元信息的映射
  const deviceMeta = new Map(
    blockDevices.map((bd) => [`/dev/${bd.name}`, bd]),
  );

  const disks = diskHealth.map((dh) => {
    const meta = deviceMeta.get(dh.device);
    return {
      device: dh.device,
      healthy: dh.healthy,
      temperature: dh.temperature,
      powerOnHours: dh.powerOnHours,
      model: meta?.model ?? null,
      serial: meta?.serial ?? null,
      transport: meta?.transport ?? null,
      sizeBytes: (meta?.sizeBytes ?? 0n).toString(),
    };
  });

  const healthyDisks = disks.filter((d) => d.healthy).length;

  return {
    timestamp: new Date().toISOString(),
    totalDisks: disks.length,
    healthyDisks,
    disks,
  };
}

/**
 * 获取网卡驱动与接口状态综合报告
 * @returns 网卡驱动 API 响应
 */
export async function getNetworkDriversReport(): Promise<NetworkDriversResponse> {
  const [drivers, interfaceNames] = await Promise.all([
    dao.fetchNetworkDrivers(),
    dao.listNetworkInterfaces(),
  ]);

  // 并发获取所有接口状态
  const interfaces = await Promise.all(
    interfaceNames.map((name) => dao.fetchInterfaceInfo(name)),
  );

  const loadedCount = drivers.filter((d) => d.loaded).length;

  return {
    timestamp: new Date().toISOString(),
    drivers,
    loadedCount,
    interfaces,
  };
}
