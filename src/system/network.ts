/**
 * 网络硬件检测封装
 * 通过 ethtool、lspci、lsmod 检测网卡驱动状态
 */
import { executeCommand } from './command-executor.js';
import type { NetworkDriverInfo, NetworkInterfaceInfo } from '../modules/hardware/hardware.types.js';

/** 主流消费级网卡驱动映射 */
const KNOWN_NIC_DRIVERS: Record<string, { vendor: string; product: string }> = {
  r8125: { vendor: 'Realtek', product: 'RTL8125 (2.5GbE)' },
  r8156: { vendor: 'Realtek', product: 'RTL8156 (2.5GbE USB)' },
  r8169: { vendor: 'Realtek', product: 'RTL8169/8125 (fallback)' },
  igc: { vendor: 'Intel', product: 'i225/i226 (2.5GbE)' },
  e1000e: { vendor: 'Intel', product: 'Intel Gigabit Ethernet' },
  mlx5_core: { vendor: 'Mellanox', product: 'ConnectX-4/5/6' },
  mlx4_core: { vendor: 'Mellanox', product: 'ConnectX-3' },
};

/**
 * 获取已加载的内核模块列表
 */
export async function getLoadedModules(): Promise<Set<string>> {
  const result = await executeCommand('lsmod');
  const modules = new Set<string>();

  if (result.exitCode === 0) {
    const lines = result.stdout.trim().split('\n').slice(1); // 跳过表头
    for (const line of lines) {
      const name = line.split(/\s+/)[0];
      if (name) modules.add(name);
    }
  }
  return modules;
}

/**
 * 获取 PCI 网络设备列表
 */
export async function getPciNetworkDevices(): Promise<
  Array<{ slot: string; description: string }>
> {
  const result = await executeCommand('lspci', ['-nn']);
  const devices: Array<{ slot: string; description: string }> = [];

  if (result.exitCode === 0) {
    const lines = result.stdout.trim().split('\n');
    for (const line of lines) {
      if (
        line.includes('Ethernet') ||
        line.includes('Network') ||
        line.includes('ethernet')
      ) {
        const parts = line.split(' ');
        const slot = parts[0] ?? '';
        devices.push({ slot, description: line });
      }
    }
  }
  return devices;
}

/**
 * 检测主流网卡驱动加载状态
 * @returns 网卡驱动信息数组
 */
export async function detectNetworkDrivers(): Promise<NetworkDriverInfo[]> {
  const loadedModules = await getLoadedModules();
  const pciDevices = await getPciNetworkDevices();
  const results: NetworkDriverInfo[] = [];

  for (const [driverName, info] of Object.entries(KNOWN_NIC_DRIVERS)) {
    const isLoaded = loadedModules.has(driverName);

    // 尝试获取驱动详情
    let version: string | null = null;
    let firmware: string | null = null;

    if (isLoaded) {
      const modResult = await executeCommand('modinfo', [driverName]);
      if (modResult.exitCode === 0) {
        const versionMatch = modResult.stdout.match(/^version:\s*(.+)$/m);
        const fwMatch = modResult.stdout.match(/^firmware:\s*(.+)$/m);
        version = versionMatch?.[1] ?? null;
        firmware = fwMatch?.[1] ?? null;
      }
    }

    // 查找匹配的 PCI 设备
    const matchedDevices = pciDevices.filter(
      (d) =>
        d.description.toLowerCase().includes(info.vendor.toLowerCase()) ||
        d.description.toLowerCase().includes(info.product.toLowerCase()),
    );

    results.push({
      driver: driverName,
      vendor: info.vendor,
      product: info.product,
      loaded: isLoaded,
      version,
      firmware,
      pciDevices: matchedDevices.map((d) => d.description),
    });
  }

  return results;
}

/**
 * 获取网络接口链路状态
 * @param interfaceName - 接口名，如 eth0
 */
export async function getInterfaceInfo(
  interfaceName: string,
): Promise<NetworkInterfaceInfo> {
  const result = await executeCommand('ethtool', [interfaceName]);

  const info: NetworkInterfaceInfo = {
    name: interfaceName,
    linkDetected: false,
    speed: null,
    duplex: null,
    driver: null,
  };

  if (result.exitCode !== 0) {
    return info;
  }

  const output = result.stdout;
  info.linkDetected = output.includes('Link detected: yes');

  const speedMatch = output.match(/Speed:\s*(\d+Mb\/s)/);
  info.speed = speedMatch?.[1] ?? null;

  const duplexMatch = output.match(/Duplex:\s*(\w+)/);
  info.duplex = duplexMatch?.[1] ?? null;

  const driverMatch = output.match(/driver:\s*(\S+)/);
  info.driver = driverMatch?.[1] ?? null;

  return info;
}
