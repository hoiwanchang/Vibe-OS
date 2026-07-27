/**
 * 演示模式内置数据
 * 后端不可达时作为降级数据源，保证控制台 UI 可完整演示
 * 数据刻意包含异常场景（SMART 告警磁盘、掉线网卡、离线节点）以展示告警链路
 */
import type {
  ContainerInfo,
  ContainerLogResult,
  DiskHealthResponse,
  HealthInfo,
  NetworkDriversResponse,
  SystemOverview,
  TailscaleStatusResponse,
  UserListResponse,
} from './types';

const now = () => new Date().toISOString();

/** 模拟系统概览（CPU/内存带轻微随机抖动，模拟实时感） */
export function demoOverview(): SystemOverview {
  const cpu = 18 + Math.round(Math.random() * 30);
  const memUsed = 5.2 + Math.random() * 0.8;
  const total = 16;
  return {
    timestamp: now(),
    system: {
      hostname: 'naisys-node-01',
      platform: 'Linux 6.12.0-trixie',
      arch: 'x64',
      cpuModel: 'AMD Ryzen 7 5800X 8-Core Processor',
      cpuCores: 16,
      uptimeSeconds: 1287645,
      loadAvg: [1.24, 0.98, 0.87],
      nodeVersion: 'v22.16.0',
    },
    cpu: { usagePercent: cpu, cores: 16 },
    memory: {
      timestamp: now(),
      totalBytes: total * 1024 ** 3,
      freeBytes: (total - memUsed) * 1024 ** 3,
      usedBytes: memUsed * 1024 ** 3,
      usedPercent: Math.round((memUsed / total) * 1000) / 10,
    },
    storage: [
      {
        device: '/dev/nvme0n1p2',
        mountPoint: '/',
        fsType: 'ext4',
        totalBytes: 480 * 1024 ** 3,
        freeBytes: 292 * 1024 ** 3,
        availableBytes: 268 * 1024 ** 3,
        usedBytes: 188 * 1024 ** 3,
        usedPercent: 41.2,
      },
      {
        device: '/dev/sda1',
        mountPoint: '/data',
        fsType: 'ext4',
        totalBytes: 8000 * 1024 ** 3,
        freeBytes: 2320 * 1024 ** 3,
        availableBytes: 2180 * 1024 ** 3,
        usedBytes: 5680 * 1024 ** 3,
        usedPercent: 72.1,
      },
      {
        device: '/dev/sdb1',
        mountPoint: '/data/backup',
        fsType: 'xfs',
        totalBytes: 4000 * 1024 ** 3,
        freeBytes: 460 * 1024 ** 3,
        availableBytes: 420 * 1024 ** 3,
        usedBytes: 3540 * 1024 ** 3,
        usedPercent: 88.5,
      },
    ],
  };
}

/** 模拟磁盘健康（/dev/sdb SMART 告警） */
export function demoDiskHealth(): DiskHealthResponse {
  return {
    timestamp: now(),
    totalDisks: 3,
    healthyDisks: 2,
    disks: [
      {
        device: '/dev/nvme0n1',
        healthy: true,
        temperature: 41,
        powerOnHours: 3216,
        model: 'Samsung SSD 980 PRO 500GB',
        serial: 'S5GXNY0T123456',
        transport: 'nvme',
        sizeBytes: String(500 * 1024 ** 3),
      },
      {
        device: '/dev/sda',
        healthy: true,
        temperature: 36,
        powerOnHours: 8760,
        model: 'WDC WD80EFAX-68KNBN0',
        serial: 'WD-WX21D2345678',
        transport: 'sata',
        sizeBytes: String(8000 * 1024 ** 3),
      },
      {
        device: '/dev/sdb',
        healthy: false,
        temperature: 49,
        powerOnHours: 26340,
        model: 'ST4000VN008-2DR166',
        serial: 'ZGY3ABCD',
        transport: 'sata',
        sizeBytes: String(4000 * 1024 ** 3),
      },
    ],
  };
}

/** 模拟网卡状态（eth1 掉线） */
export function demoNetworkDrivers(): NetworkDriversResponse {
  return {
    timestamp: now(),
    loadedCount: 2,
    drivers: [
      {
        driver: 'r8169',
        vendor: 'Realtek',
        product: 'RTL8125B 2.5GbE',
        loaded: true,
        version: '6.011.00',
        firmware: null,
        pciDevices: ['03:00.0 Ethernet controller: Realtek RTL8125B'],
      },
      {
        driver: 'igc',
        vendor: 'Intel',
        product: 'I225-V',
        loaded: true,
        version: '1.1.3',
        firmware: null,
        pciDevices: ['04:00.0 Ethernet controller: Intel I225-V'],
      },
    ],
    interfaces: [
      { name: 'lo', linkDetected: true, speed: null, duplex: null, driver: null },
      {
        name: 'eth0',
        linkDetected: true,
        speed: '2500Mb/s',
        duplex: 'full',
        driver: 'r8169',
      },
      {
        name: 'eth1',
        linkDetected: false,
        speed: null,
        duplex: null,
        driver: 'igc',
      },
      {
        name: 'tailscale0',
        linkDetected: true,
        speed: null,
        duplex: null,
        driver: 'tun',
      },
    ],
  };
}

/** 模拟容器列表 */
export function demoContainers(): ContainerInfo[] {
  return [
    {
      id: 'a1b2c3d4e5f6',
      name: 'ollama',
      image: 'ollama/ollama:0.9.6',
      status: 'Up 6 days',
      state: 'running',
      ports: '0.0.0.0:11434->11434/tcp',
      createdAt: '2026-07-21 09:12:00',
    },
    {
      id: 'b2c3d4e5f6a7',
      name: 'dify',
      image: 'langgenius/dify-api:1.4.2',
      status: 'Up 3 days',
      state: 'running',
      ports: '0.0.0.0:5001->5001/tcp',
      createdAt: '2026-07-24 14:30:00',
    },
    {
      id: 'c3d4e5f6a7b8',
      name: 'whisper-asr',
      image: 'onerahmet/openai-whisper-asr-webservice:latest',
      status: 'Exited (0) 2 hours ago',
      state: 'exited',
      ports: '',
      createdAt: '2026-07-20 11:05:00',
    },
  ];
}

/** 模拟 Tailscale 状态（一台节点离线） */
export function demoTailscale(): TailscaleStatusResponse {
  return {
    timestamp: now(),
    available: true,
    status: {
      backendState: 'Running',
      self: {
        hostname: 'naisys-node-01',
        ips: ['100.64.252.114'],
        os: 'linux',
        online: true,
      },
      peers: [
        {
          id: 'peer-macbook',
          hostname: 'kane-macbook',
          ips: ['100.64.18.77'],
          os: 'macOS',
          online: true,
          active: true,
        },
        {
          id: 'peer-thinkpad',
          hostname: 'thinkpad-x1',
          ips: ['100.64.90.12'],
          os: 'linux',
          online: true,
          active: false,
        },
        {
          id: 'peer-office',
          hostname: 'office-win',
          ips: ['100.64.33.201'],
          os: 'windows',
          online: false,
          active: false,
        },
      ],
      error: null,
    },
    subnetRoutes: [
      { cidr: '192.168.50.0/24', advertised: true, approved: true },
    ],
  };
}

/** 模拟用户列表 */
export function demoUsers(): UserListResponse {
  return {
    timestamp: now(),
    count: 3,
    users: [
      {
        uid: 1000,
        username: 'kane',
        dataDir: '/data/1000',
        dirExists: true,
        usedBytes: String(412.6 * 1024 ** 3),
        quotaBytes: String(1024 * 1024 ** 3),
        usagePercent: 40.3,
      },
      {
        uid: 1001,
        username: 'alice',
        dataDir: '/data/1001',
        dirExists: true,
        usedBytes: String(87.2 * 1024 ** 3),
        quotaBytes: String(512 * 1024 ** 3),
        usagePercent: 17.0,
      },
      {
        uid: 1002,
        username: 'lab-guest',
        dataDir: '/data/1002',
        dirExists: true,
        usedBytes: String(9.8 * 1024 ** 3),
        quotaBytes: String(100 * 1024 ** 3),
        usagePercent: 9.8,
      },
    ],
  };
}

/** 模拟容器日志 */
export function demoLogs(name: string): ContainerLogResult {
  const lines = [
    `[naisys] container "${name}" — demo log stream`,
    '[INFO] loading configuration from /data/naisys/' + name + '/data/config.yaml',
    '[INFO] model cache mounted at /models (read-only)',
    '[INFO] listening on 0.0.0.0:8080',
    '[INFO] worker #0 ready (warmup 1.82s)',
    '[INFO] worker #1 ready (warmup 1.79s)',
    '[WARN] GPU not detected, falling back to CPU inference',
    '[INFO] health endpoint /api/health → 200 (3ms)',
    '[INFO] POST /v1/chat/completions → 200 (1841ms, 214 tokens)',
    '[INFO] POST /v1/chat/completions → 200 (1287ms, 96 tokens)',
  ];
  return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
}

/** 模拟健康检查 */
export function demoHealth(): HealthInfo {
  return { service: 'naisys-backend', version: '0.1.0', timestamp: now() };
}
