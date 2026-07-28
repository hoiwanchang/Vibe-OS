/**
 * 演示模式内置数据
 * 后端不可达时作为降级数据源，保证控制台 UI 可完整演示
 * 数据刻意包含异常场景（SMART 告警磁盘、掉线网卡、离线节点）以展示告警链路
 */
import type {
  BackupExecution,
  BackupJob,
  ContainerInfo,
  ContainerLogResult,
  DiskHealthResponse,
  DiskSmartDetail,
  DownloadTask,
  FileEntry,
  FileListResult,
  FirewallRule,
  HealthInfo,
  JobExecution,
  ListeningPort,
  NetInterface,
  NetworkDriversResponse,
  NotificationItem,
  NotificationListResponse,
  NotificationSettings,
  PhysicalDisk,
  ScheduledJob,
  ScrubStatus,
  ShareInfo,
  ShareStatusResponse,
  SnapshotInfo,
  StoragePoolInfo,
  SystemOverview,
  TailscaleStatusResponse,
  UserListResponse,
  WolDevice,
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

/* ============================================================
   NAS 核心功能模块演示数据
   ============================================================ */

const GB = 1024 ** 3;
const TB = 1024 ** 4;

/* ---------- 文件管理器 ---------- */

const demoFileTree: Record<string, FileEntry[]> = {
  '': [
    { name: 'docs', path: 'docs', type: 'directory', size: 0, modifiedAt: '2026-07-25T09:12:00Z', permissions: 'rwxr-xr-x' },
    { name: 'media', path: 'media', type: 'directory', size: 0, modifiedAt: '2026-07-24T14:30:00Z', permissions: 'rwxr-xr-x' },
    { name: 'projects', path: 'projects', type: 'directory', size: 0, modifiedAt: '2026-07-26T11:05:00Z', permissions: 'rwxr-xr-x' },
    { name: 'backups', path: 'backups', type: 'directory', size: 0, modifiedAt: '2026-07-20T08:00:00Z', permissions: 'rwxr-xr-x' },
    { name: 'readme.txt', path: 'readme.txt', type: 'file', size: 2048, modifiedAt: '2026-07-26T16:45:00Z', permissions: 'rw-r--r--', mimeType: 'text/plain' },
    { name: 'notes.md', path: 'notes.md', type: 'file', size: 5632, modifiedAt: '2026-07-27T10:20:00Z', permissions: 'rw-r--r--', mimeType: 'text/markdown' },
    { name: 'config.yaml', path: 'config.yaml', type: 'file', size: 1280, modifiedAt: '2026-07-23T09:00:00Z', permissions: 'rw-r--r--', mimeType: 'text/yaml' },
  ],
  'docs': [
    { name: '论文', path: 'docs/论文', type: 'directory', size: 0, modifiedAt: '2026-07-22T15:00:00Z', permissions: 'rwxr-xr-x' },
    { name: '合同', path: 'docs/合同', type: 'directory', size: 0, modifiedAt: '2026-07-18T10:30:00Z', permissions: 'rwxr-xr-x' },
    { name: '简历.pdf', path: 'docs/简历.pdf', type: 'file', size: 482 * 1024, modifiedAt: '2026-07-21T09:15:00Z', permissions: 'rw-r--r--', mimeType: 'application/pdf' },
    { name: '会议纪要.md', path: 'docs/会议纪要.md', type: 'file', size: 8192, modifiedAt: '2026-07-25T17:30:00Z', permissions: 'rw-r--r--', mimeType: 'text/markdown' },
  ],
  'docs/论文': [
    { name: 'persistent-homology.pdf', path: 'docs/论文/persistent-homology.pdf', type: 'file', size: 2.4 * 1024 * 1024, modifiedAt: '2026-07-19T14:00:00Z', permissions: 'rw-r--r--', mimeType: 'application/pdf' },
    { name: 'draft.tex', path: 'docs/论文/draft.tex', type: 'file', size: 45 * 1024, modifiedAt: '2026-07-22T15:00:00Z', permissions: 'rw-r--r--', mimeType: 'text/x-tex' },
  ],
  'docs/合同': [
    { name: '租赁合同-2026.pdf', path: 'docs/合同/租赁合同-2026.pdf', type: 'file', size: 1.1 * 1024 * 1024, modifiedAt: '2026-07-18T10:30:00Z', permissions: 'rw-r--r--', mimeType: 'application/pdf' },
  ],
  'media': [
    { name: '照片', path: 'media/照片', type: 'directory', size: 0, modifiedAt: '2026-07-15T20:00:00Z', permissions: 'rwxr-xr-x' },
    { name: '音乐', path: 'media/音乐', type: 'directory', size: 0, modifiedAt: '2026-07-10T12:00:00Z', permissions: 'rwxr-xr-x' },
    { name: 'wallpaper.png', path: 'media/wallpaper.png', type: 'file', size: 3.8 * 1024 * 1024, modifiedAt: '2026-07-12T08:00:00Z', permissions: 'rw-r--r--', mimeType: 'image/png' },
  ],
  'media/照片': [
    { name: 'IMG_20260701.jpg', path: 'media/照片/IMG_20260701.jpg', type: 'file', size: 4.2 * 1024 * 1024, modifiedAt: '2026-07-01T18:30:00Z', permissions: 'rw-r--r--', mimeType: 'image/jpeg' },
    { name: 'IMG_20260715.jpg', path: 'media/照片/IMG_20260715.jpg', type: 'file', size: 3.9 * 1024 * 1024, modifiedAt: '2026-07-15T20:00:00Z', permissions: 'rw-r--r--', mimeType: 'image/jpeg' },
  ],
  'media/音乐': [
    { name: 'playlist.m3u', path: 'media/音乐/playlist.m3u', type: 'file', size: 512, modifiedAt: '2026-07-10T12:00:00Z', permissions: 'rw-r--r--', mimeType: 'audio/x-mpegurl' },
  ],
  'projects': [
    { name: 'vibe-os', path: 'projects/vibe-os', type: 'directory', size: 0, modifiedAt: '2026-07-27T22:00:00Z', permissions: 'rwxr-xr-x' },
    { name: 'todo.md', path: 'projects/todo.md', type: 'file', size: 3072, modifiedAt: '2026-07-26T11:05:00Z', permissions: 'rw-r--r--', mimeType: 'text/markdown' },
  ],
  'projects/vibe-os': [
    { name: 'package.json', path: 'projects/vibe-os/package.json', type: 'file', size: 1843, modifiedAt: '2026-07-27T22:00:00Z', permissions: 'rw-r--r--', mimeType: 'application/json' },
    { name: 'README.md', path: 'projects/vibe-os/README.md', type: 'file', size: 6144, modifiedAt: '2026-07-27T20:00:00Z', permissions: 'rw-r--r--', mimeType: 'text/markdown' },
  ],
  'backups': [
    { name: 'db-dump-20260727.sql', path: 'backups/db-dump-20260727.sql', type: 'file', size: 128 * 1024 * 1024, modifiedAt: '2026-07-27T03:00:00Z', permissions: 'rw-------', mimeType: 'application/sql' },
    { name: 'db-dump-20260726.sql', path: 'backups/db-dump-20260726.sql', type: 'file', size: 126 * 1024 * 1024, modifiedAt: '2026-07-26T03:00:00Z', permissions: 'rw-------', mimeType: 'application/sql' },
  ],
};

const demoTrashItems: FileEntry[] = [
  { name: 'old-report.docx', path: '.trash/old-report.docx', type: 'file', size: 89 * 1024, modifiedAt: '2026-07-20T14:00:00Z', permissions: 'rw-r--r--', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { name: 'temp-data.csv', path: '.trash/temp-data.csv', type: 'file', size: 12 * 1024 * 1024, modifiedAt: '2026-07-22T09:30:00Z', permissions: 'rw-r--r--', mimeType: 'text/csv' },
  { name: 'screenshot-old.png', path: '.trash/screenshot-old.png', type: 'file', size: 1.8 * 1024 * 1024, modifiedAt: '2026-07-18T16:45:00Z', permissions: 'rw-r--r--', mimeType: 'image/png' },
];

/** 模拟文件列表（按路径查表，未知路径返回空目录） */
export function demoFileList(path: string): FileListResult {
  const entries = demoFileTree[path] ?? [];
  return { entries, path, total: entries.length };
}

/** 模拟回收站列表 */
export function demoTrashList(): { entries: FileEntry[]; total: number } {
  return { entries: demoTrashItems, total: demoTrashItems.length };
}

/** 模拟文件内容读取 */
export function demoFileRead(path: string): { content: string; size: number; truncated: boolean; mimeType: string } {
  const name = path.split('/').pop() ?? path;
  const content = [
    `# ${name}`,
    '',
    `这是演示模式下 "${path}" 的模拟内容。`,
    '',
    '后端服务不可达时，文件管理器以内置数据运行。',
    '连接后端后将读取真实文件内容。',
    '',
    '--- demo content ---',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'NAISys 私有 AI NAS — 所有数据完全本地化。',
  ].join('\n');
  return { content, size: content.length, truncated: false, mimeType: 'text/plain' };
}

/* ---------- 存储池 ---------- */

/** 模拟物理磁盘列表（/dev/sdc SMART 告警，/dev/sdd 未使用） */
export function demoDisks(): PhysicalDisk[] {
  return [
    {
      device: '/dev/sda', model: 'WDC WD80EFAX-68KNBN0', serial: 'WD-WX21D2345678',
      sizeBytes: 8 * TB, fsType: 'linux_raid_member', mountPoint: null, inPool: 'data-pool',
      smart: { healthy: true, temperature: 36, powerOnHours: 8760 },
    },
    {
      device: '/dev/sdb', model: 'WDC WD80EFAX-68KNBN0', serial: 'WD-WX21D2345679',
      sizeBytes: 8 * TB, fsType: 'linux_raid_member', mountPoint: null, inPool: 'data-pool',
      smart: { healthy: true, temperature: 38, powerOnHours: 8760 },
    },
    {
      device: '/dev/sdc', model: 'ST4000VN008-2DR166', serial: 'ZGY3ABCD',
      sizeBytes: 4 * TB, fsType: 'linux_raid_member', mountPoint: null, inPool: 'data-pool',
      smart: { healthy: false, temperature: 49, powerOnHours: 26340 },
    },
    {
      device: '/dev/sdd', model: 'TOSHIBA MG08ACA16TE', serial: 'X3T0A0BTF9LG',
      sizeBytes: 16 * TB, fsType: null, mountPoint: null, inPool: null,
      smart: { healthy: true, temperature: 33, powerOnHours: 120 },
    },
    {
      device: '/dev/nvme0n1', model: 'Samsung SSD 980 PRO 500GB', serial: 'S5GXNY0T123456',
      sizeBytes: 500 * GB, fsType: 'ext4', mountPoint: '/', inPool: null,
      smart: { healthy: true, temperature: 41, powerOnHours: 3216 },
    },
  ];
}

/** 模拟存储池列表（data-pool 降级，backup-pool 正常） */
export function demoPools(): StoragePoolInfo[] {
  return [
    {
      name: 'data-pool', level: 'raid5', devices: ['/dev/sda', '/dev/sdb', '/dev/sdc'],
      totalBytes: 16 * TB, usedBytes: 10.7 * TB, freeBytes: 5.3 * TB, usedPercent: 66.9,
      mountPoint: '/data', state: 'degraded',
    },
    {
      name: 'backup-pool', level: 'raid1', devices: ['/dev/sde', '/dev/sdf'],
      totalBytes: 4 * TB, usedBytes: 2.4 * TB, freeBytes: 1.6 * TB, usedPercent: 60.0,
      mountPoint: '/data/backup', state: 'active',
    },
  ];
}

/** 模拟池 SMART 详情 */
export function demoPoolSmart(name: string): DiskSmartDetail[] {
  return demoDisks()
    .filter((d) => d.inPool === name)
    .map((d) => ({
      device: d.device,
      healthy: d.smart.healthy,
      temperature: d.smart.temperature,
      powerOnHours: d.smart.powerOnHours,
      attributes: {
        'Reallocated_Sector_Ct': { value: d.smart.healthy ? 100 : 92, worst: d.smart.healthy ? 100 : 92, thresh: 36, raw: d.smart.healthy ? 0 : 48 },
        'Current_Pending_Sector': { value: d.smart.healthy ? 100 : 88, worst: d.smart.healthy ? 100 : 88, thresh: 0, raw: d.smart.healthy ? 0 : 12 },
        'Temperature_Celsius': { value: 100, worst: 100, thresh: 0, raw: d.smart.temperature ?? 0 },
        'Power_On_Hours': { value: 100, worst: 100, thresh: 0, raw: d.smart.powerOnHours ?? 0 },
      },
    }));
}

/** 模拟 Scrub 状态 */
export function demoScrubStatus(): ScrubStatus {
  return { running: false, progress: 0, errors: 0 };
}

/* ---------- 共享文件夹 ---------- */

/** 模拟共享列表 */
export function demoShares(): ShareInfo[] {
  return [
    { name: 'docs', path: '/data/1000/files/docs', protocol: 'smb', readonly: false, validUsers: ['kane', 'alice'], hosts: [], enabled: true, port: 445 },
    { name: 'media', path: '/data/1000/files/media', protocol: 'nfs', readonly: true, validUsers: [], hosts: ['192.168.50.0/24'], enabled: true },
    { name: 'webdav-sync', path: '/data/1000/files/projects', protocol: 'webdav', readonly: false, validUsers: ['kane'], hosts: [], enabled: false, port: 8080 },
  ];
}

/** 模拟共享状态（含连接详情） */
export function demoShareStatus(name: string): ShareStatusResponse {
  const running = name !== 'webdav-sync';
  return {
    name,
    running,
    connections: running
      ? [
          { user: 'kane', host: '192.168.50.12', openedAt: '2026-07-27T09:12:00Z', files: 3 },
          { user: 'alice', host: '192.168.50.34', openedAt: '2026-07-27T14:30:00Z', files: 1 },
        ]
      : [],
  };
}

/* ---------- 备份与快照 ---------- */

/** 模拟备份任务列表 */
export function demoBackupJobs(): BackupJob[] {
  return [
    { id: 'bk-001', name: '每日文档备份', source: '/data/1000/files/docs', target: '/data/backup/docs', type: 'rsync', schedule: '0 3 * * *', enabled: true, lastRun: '2026-07-27T03:00:00Z', lastStatus: 'success' },
    { id: 'bk-002', name: '项目归档', source: '/data/1000/files/projects', target: '/data/backup/projects', type: 'archive', schedule: '0 4 * * 0', enabled: true, lastRun: '2026-07-26T04:00:00Z', lastStatus: 'failed' },
    { id: 'bk-003', name: '媒体快照', source: '/data/1000/files/media', target: 'data-pool', type: 'snapshot', schedule: null, enabled: false, lastRun: null, lastStatus: null },
  ];
}

/** 模拟备份执行历史 */
export function demoBackupHistory(jobId: string): BackupExecution[] {
  if (jobId === 'bk-002') {
    return [
      { id: 'ex-004', jobId, startedAt: '2026-07-26T04:00:00Z', finishedAt: '2026-07-26T04:02:13Z', status: 'failed', filesTransferred: 42, bytesTransferred: 310 * 1024 * 1024, error: '目标路径 /data/backup/projects 不可达（磁盘未挂载）' },
      { id: 'ex-003', jobId, startedAt: '2026-07-19T04:00:00Z', finishedAt: '2026-07-19T04:18:42Z', status: 'success', filesTransferred: 1280, bytesTransferred: 4.2 * 1024 ** 3 },
    ];
  }
  return [
    { id: 'ex-002', jobId, startedAt: '2026-07-27T03:00:00Z', finishedAt: '2026-07-27T03:04:31Z', status: 'success', filesTransferred: 342, bytesTransferred: 1.2 * 1024 ** 3 },
    { id: 'ex-001', jobId, startedAt: '2026-07-26T03:00:00Z', finishedAt: '2026-07-26T03:02:58Z', status: 'success', filesTransferred: 128, bytesTransferred: 800 * 1024 * 1024 },
  ];
}

/** 模拟快照列表 */
export function demoSnapshots(): SnapshotInfo[] {
  return [
    { name: 'snap-0727', pool: 'data-pool', createdAt: '2026-07-27T03:00:00Z', usedBytes: 2.1 * 1024 ** 3, referencedBytes: 10.7 * 1024 ** 3 },
    { name: 'snap-0720', pool: 'data-pool', createdAt: '2026-07-20T03:00:00Z', usedBytes: 1.8 * 1024 ** 3, referencedBytes: 10.2 * 1024 ** 3 },
    { name: 'media-0715', pool: 'backup-pool', createdAt: '2026-07-15T05:00:00Z', usedBytes: 620 * 1024 * 1024, referencedBytes: 2.4 * 1024 ** 3 },
  ];
}

/* ---------- 下载中心 ---------- */

/** 模拟下载任务列表（含活动/等待/完成/错误各状态） */
export function demoDownloadTasks(): DownloadTask[] {
  return [
    {
      gid: 'dl-001', name: 'ubuntu-24.04.2-desktop-amd64.iso', status: 'active',
      totalBytes: 5.8 * 1024 ** 3, completedBytes: 4.5 * 1024 ** 3, progress: 78,
      downloadSpeed: 12.3 * 1024 * 1024, uploadSpeed: 0, connections: 16, eta: 108,
      dir: '/data/1000/files/downloads', files: [{ path: 'ubuntu-24.04.2-desktop-amd64.iso', length: 5.8 * 1024 ** 3, completedLength: 4.5 * 1024 ** 3 }],
      startedAt: '2026-07-27T20:12:00Z', completedAt: null,
    },
    {
      gid: 'dl-002', name: 'debian-13.0.0-amd64-netinst.iso', status: 'active',
      totalBytes: 630 * 1024 * 1024, completedBytes: 210 * 1024 * 1024, progress: 33,
      downloadSpeed: 8.7 * 1024 * 1024, uploadSpeed: 0, connections: 8, eta: 48,
      dir: '/data/1000/files/downloads', files: [{ path: 'debian-13.0.0-amd64-netinst.iso', length: 630 * 1024 * 1024, completedLength: 210 * 1024 * 1024 }],
      startedAt: '2026-07-27T20:30:00Z', completedAt: null,
    },
    {
      gid: 'dl-003', name: 'llama-3.1-8b-instruct-q8.gguf', status: 'waiting',
      totalBytes: 8.5 * 1024 ** 3, completedBytes: 0, progress: 0,
      downloadSpeed: 0, uploadSpeed: 0, connections: 0, eta: null,
      dir: '/data/naisys/ollama/models', files: [{ path: 'llama-3.1-8b-instruct-q8.gguf', length: 8.5 * 1024 ** 3, completedLength: 0 }],
      startedAt: '2026-07-27T20:35:00Z', completedAt: null,
    },
    {
      gid: 'dl-004', name: 'node-v22.16.0-linux-x64.tar.xz', status: 'complete',
      totalBytes: 48 * 1024 * 1024, completedBytes: 48 * 1024 * 1024, progress: 100,
      downloadSpeed: 0, uploadSpeed: 0, connections: 0, eta: null,
      dir: '/data/1000/files/downloads', files: [{ path: 'node-v22.16.0-linux-x64.tar.xz', length: 48 * 1024 * 1024, completedLength: 48 * 1024 * 1024 }],
      startedAt: '2026-07-26T15:00:00Z', completedAt: '2026-07-26T15:00:42Z',
    },
    {
      gid: 'dl-005', name: 'broken-link-file.zip', status: 'error',
      totalBytes: 120 * 1024 * 1024, completedBytes: 12 * 1024 * 1024, progress: 10,
      downloadSpeed: 0, uploadSpeed: 0, connections: 0, eta: null,
      dir: '/data/1000/files/downloads', files: [{ path: 'broken-link-file.zip', length: 120 * 1024 * 1024, completedLength: 12 * 1024 * 1024 }],
      error: 'HTTP 404 Not Found — 远程文件不存在',
      startedAt: '2026-07-25T10:00:00Z', completedAt: null,
    },
  ];
}

/** 模拟下载设置 */
export function demoDownloadSettings(): Record<string, string> {
  return {
    'max-concurrent-downloads': '3',
    'max-overall-download-limit': '0',
    'max-overall-upload-limit': '1048576',
    'dir': '/data/1000/files/downloads',
    'bt-listen-port': '6881-6999',
    'seed-ratio': '1.0',
  };
}

/* ---------- 网络配置 ---------- */

/** 模拟网络接口列表 */
export function demoNetInterfaces(): NetInterface[] {
  return [
    {
      name: 'eth0', type: 'ethernet', state: 'up', method: 'dhcp',
      addresses: [{ family: 'inet', address: '192.168.50.10', prefix: 24 }],
      mac: '52:54:00:12:34:56', speed: '2500Mb/s', gateway: '192.168.50.1',
    },
    {
      name: 'eth1', type: 'ethernet', state: 'down', method: 'manual',
      addresses: [],
      mac: '52:54:00:12:34:57', speed: null, gateway: null,
    },
    {
      name: 'tailscale0', type: 'bridge', state: 'up', method: 'manual',
      addresses: [{ family: 'inet', address: '100.64.252.114', prefix: 32 }],
      mac: '00:00:00:00:00:00', speed: null, gateway: null,
    },
    {
      name: 'lo', type: 'loopback', state: 'up', method: 'manual',
      addresses: [{ family: 'inet', address: '127.0.0.1', prefix: 8 }],
      mac: '00:00:00:00:00:00', speed: null, gateway: null,
    },
  ];
}

/** 模拟防火墙规则 */
export function demoFirewallRules(): FirewallRule[] {
  return [
    { id: 'fw-001', chain: 'input', protocol: 'tcp', port: 22, action: 'accept', source: '192.168.50.0/24', comment: 'SSH 内网访问' },
    { id: 'fw-002', chain: 'input', protocol: 'tcp', port: 445, action: 'accept', source: '192.168.50.0/24', comment: 'SMB 共享' },
    { id: 'fw-003', chain: 'input', protocol: 'tcp', port: 3000, action: 'accept', source: null, comment: 'NAISys 控制台' },
    { id: 'fw-004', chain: 'input', protocol: 'udp', port: 41641, action: 'accept', source: null, comment: 'Tailscale DERP' },
    { id: 'fw-005', chain: 'input', protocol: 'all', port: null, action: 'drop', source: null, comment: '默认拒绝入站' },
  ];
}

/** 模拟监听端口 */
export function demoListeningPorts(): ListeningPort[] {
  return [
    { protocol: 'tcp', localAddress: '0.0.0.0', port: 22, process: 'sshd', pid: 812 },
    { protocol: 'tcp', localAddress: '0.0.0.0', port: 445, process: 'smbd', pid: 1024 },
    { protocol: 'tcp', localAddress: '127.0.0.1', port: 3000, process: 'node', pid: 1498290 },
    { protocol: 'tcp', localAddress: '0.0.0.0', port: 11434, process: 'ollama', pid: 2048 },
    { protocol: 'tcp', localAddress: '127.0.0.1', port: 5173, process: 'node', pid: 1520051 },
    { protocol: 'udp', localAddress: '0.0.0.0', port: 41641, process: 'tailscaled', pid: 901 },
    { protocol: 'tcp', localAddress: '0.0.0.0', port: 2049, process: 'nfsd', pid: 1100 },
  ];
}

/** 模拟 WoL 设备 */
export function demoWolDevices(): WolDevice[] {
  return [
    { name: '办公室工作站', mac: 'AA:BB:CC:DD:EE:01', lastWake: '2026-07-26T08:30:00Z' },
    { name: '实验室服务器', mac: 'AA:BB:CC:DD:EE:02', lastWake: '2026-07-24T09:00:00Z' },
    { name: '客厅 HTPC', mac: 'AA:BB:CC:DD:EE:03', lastWake: null },
  ];
}

/* ---------- 通知 ---------- */

const demoNotificationItems: NotificationItem[] = [
  { id: 'nt-001', severity: 'critical', category: 'disk', title: '磁盘 SMART 告警：/dev/sdc', detail: 'ST4000VN008-2DR166（SN ZGY3ABCD）SMART 健康检查未通过，通电 26340 小时，温度 49°C。请尽快备份数据并更换磁盘。', source: 'hardware-monitor', read: false, createdAt: '2026-07-27T06:12:00Z' },
  { id: 'nt-002', severity: 'warning', category: 'backup', title: '备份任务失败：项目归档', detail: '目标路径 /data/backup/projects 不可达（磁盘未挂载），已传输 42 个文件后中止。', source: 'backup-scheduler', read: false, createdAt: '2026-07-26T04:02:13Z' },
  { id: 'nt-003', severity: 'warning', category: 'network', title: '网卡掉线：eth1', detail: '接口 eth1（驱动 igc）链路未检测到，请检查网线连接或交换机端口。', source: 'hardware-monitor', read: false, createdAt: '2026-07-25T22:45:00Z' },
  { id: 'nt-004', severity: 'info', category: 'service', title: '容器 ollama 已重启', detail: '容器 ollama 因健康检查失败被自动重启，当前运行正常。', source: 'container-manager', read: true, createdAt: '2026-07-25T14:30:00Z' },
  { id: 'nt-005', severity: 'info', category: 'system', title: '系统更新可用', detail: 'Debian 13 安全更新已就绪（3 个软件包），可在系统设置中安装。', source: 'apt-monitor', read: true, createdAt: '2026-07-24T09:00:00Z' },
  { id: 'nt-006', severity: 'info', category: 'security', title: '新设备接入 Tailscale 网络', detail: '节点 office-win（100.64.33.201）已通过授权加入网络。', source: 'tailscale', read: true, createdAt: '2026-07-23T16:20:00Z' },
];

/** 模拟通知列表 */
export function demoNotifications(limit = 20, offset = 0): NotificationListResponse {
  const items = demoNotificationItems.slice(offset, offset + limit);
  return {
    notifications: items,
    total: demoNotificationItems.length,
    unread: demoNotificationItems.filter((n) => !n.read).length,
  };
}

/** 模拟未读计数 */
export function demoUnreadCount(): { unread: number } {
  return { unread: demoNotificationItems.filter((n) => !n.read).length };
}

/** 模拟通知设置 */
export function demoNotificationSettings(): NotificationSettings {
  return {
    channels: [
      { type: 'webhook', enabled: false, url: '', minSeverity: 'warning' },
      { type: 'email', enabled: false, minSeverity: 'critical' },
    ],
  };
}

/* ---------- 计划任务 ---------- */

/** 模拟计划任务列表 */
export function demoScheduledJobs(): ScheduledJob[] {
  return [
    { id: 'cron-001', name: '日志清理', command: '/data/naisys/scripts/clean-logs.sh', schedule: '0 3 * * *', enabled: true, lastRun: '2026-07-27T03:00:00Z', lastStatus: 'success', nextRun: '2026-07-28T03:00:00Z' },
    { id: 'cron-002', name: 'SMART 巡检', command: '/data/naisys/scripts/smart-check.sh', schedule: '0 6 * * *', enabled: true, lastRun: '2026-07-27T06:00:00Z', lastStatus: 'success', nextRun: '2026-07-28T06:00:00Z' },
    { id: 'cron-003', name: '模型缓存预热', command: '/data/naisys/scripts/warmup-models.sh', schedule: '30 2 * * 1', enabled: false, lastRun: '2026-07-21T02:30:00Z', lastStatus: 'failed', nextRun: null },
  ];
}

/** 模拟计划任务执行历史 */
export function demoJobHistory(jobId: string): JobExecution[] {
  if (jobId === 'cron-003') {
    return [
      { id: 'jex-003', jobId, startedAt: '2026-07-21T02:30:00Z', finishedAt: '2026-07-21T02:31:12Z', exitCode: 1, stdout: 'loading model index...\ncache dir not found: /data/naisys/ollama/cache', stderr: 'ERROR: warmup aborted — cache directory missing', status: 'failed' },
    ];
  }
  return [
    { id: 'jex-002', jobId, startedAt: '2026-07-27T03:00:00Z', finishedAt: '2026-07-27T03:00:08Z', exitCode: 0, stdout: 'cleaned 142 log files, freed 3.2 GB', stderr: '', status: 'success' },
    { id: 'jex-001', jobId, startedAt: '2026-07-26T03:00:00Z', finishedAt: '2026-07-26T03:00:06Z', exitCode: 0, stdout: 'cleaned 98 log files, freed 2.1 GB', stderr: '', status: 'success' },
  ];
}

/* ---------- 应用中心演示数据 ---------- */

/** 模拟注册表应用 */
export function demoRegistryApps(): import('./types').RegistryApp[] {
  return [
    {
      id: 'jellyfin', name: 'Jellyfin 媒体服务器', category: 'media',
      description: '开源免费的媒体流服务器', icon: '🎬',
      image: 'jellyfin/jellyfin:latest',
      ports: [{ host: 8096, container: 8096 }],
      volumes: [{ host: '/data/naisys/apps/jellyfin/config', container: '/config' }],
      env: { TZ: 'Asia/Shanghai' },
      homepage: 'https://jellyfin.org',
    },
    {
      id: 'nextcloud', name: 'Nextcloud 私有网盘', category: 'files',
      description: '功能完整的私有云平台', icon: '☁️',
      image: 'nextcloud:latest',
      ports: [{ host: 8888, container: 80 }],
      volumes: [{ host: '/data/naisys/apps/nextcloud/data', container: '/var/www/html' }],
      env: { TZ: 'Asia/Shanghai' },
      homepage: 'https://nextcloud.com',
    },
    {
      id: 'vaultwarden', name: 'Vaultwarden 密码管理', category: 'security',
      description: 'Bitwarden 兼容的轻量密码管理器', icon: '🔐',
      image: 'vaultwarden/server:latest',
      ports: [{ host: 8222, container: 80 }],
      volumes: [{ host: '/data/naisys/apps/vaultwarden/data', container: '/data' }],
      env: { TZ: 'Asia/Shanghai' },
    },
    {
      id: 'ollama', name: 'Ollama 本地 AI 推理', category: 'ai',
      description: '本地大模型推理引擎', icon: '🤖',
      image: 'ollama/ollama:latest',
      ports: [{ host: 11434, container: 11434 }],
      volumes: [{ host: '/data/naisys/apps/ollama/models', container: '/root/.ollama' }],
      env: { TZ: 'Asia/Shanghai' },
    },
  ];
}

/** 模拟已安装应用 */
export function demoInstalledApps(): import('./types').InstalledAppWithStatus[] {
  return [
    {
      appId: 'homepage', containerName: 'naisys-homepage',
      image: 'ghcr.io/gethomepage/homepage:latest',
      ports: [{ host: 3333, container: 3000 }],
      volumes: [{ host: '/data/naisys/apps/homepage/config', container: '/app/config' }],
      env: { TZ: 'Asia/Shanghai' },
      installedAt: '2026-07-20T10:00:00Z', source: 'registry',
      status: 'running', containerId: 'abc123',
    },
  ];
}

/* ============================================================
   系统设置中心演示数据
   ============================================================ */

import type {
  AboutInfo,
  ManagedService,
  SettingsLogLine,
  SettingsLogSource,
  SystemSettings,
} from './types';

export function demoSettings(): SystemSettings {
  return {
    general: {
      hostname: 'naisys-node-01',
      timezone: 'Asia/Shanghai',
      locale: 'zh-CN',
      ntpEnabled: true,
      ntpServer: 'ntp.aliyun.com',
      description: 'Kane 的私有 AI NAS',
    },
    security: {
      httpsEnabled: false,
      httpsPort: 443,
      httpsCertPath: '/data/naisys/certs/server.crt',
      httpsKeyPath: '/data/naisys/certs/server.key',
      sshEnabled: true,
      sshPort: 22,
      sshPasswordAuth: false,
      maxLoginAttempts: 5,
      lockoutMinutes: 30,
      ipBlacklist: [],
      ipWhitelist: [],
      firewallEnabled: true,
      autoSecurityUpdates: true,
    },
    storage: {
      diskSpindownMinutes: 30,
      hddStandbyEnabled: true,
      smartCheckInterval: 24,
      smartEmailAlert: true,
      trashRetentionDays: 30,
      autoDefrag: false,
      writeCache: 'enabled',
    },
    power: {
      upsEnabled: false,
      upsDevice: '/dev/usb/hiddev0',
      upsShutdownThreshold: 15,
      scheduledPowerOn: { enabled: false, time: '07:00' },
      scheduledShutdown: { enabled: false, time: '23:00' },
      idleShutdown: { enabled: false, minutes: 120 },
      wakeOnLan: true,
    },
    notification: {
      channels: [
        {
          id: 'ch-1',
          type: 'webhook',
          name: '企业微信',
          enabled: true,
          url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx',
          minSeverity: 'warning',
        },
      ],
      globalMinSeverity: 'info',
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    },
    update: {
      autoCheck: true,
      autoInstall: false,
      channel: 'stable',
      lastCheck: '2026-07-27T20:00:00Z',
      currentVersion: '0.1.0',
    },
  };
}

export function demoServices(): ManagedService[] {
  return [
    { name: 'ssh', displayName: 'SSH 远程访问', description: 'OpenSSH Server', enabled: true, running: true, pid: 1234, uptime: 864000 },
    { name: 'smbd', displayName: 'SMB 文件共享', description: 'Samba', enabled: true, running: true, pid: 2345, uptime: 864000 },
    { name: 'nfs-server', displayName: 'NFS 文件共享', description: 'NFS Kernel Server', enabled: false, running: false, pid: null, uptime: null },
    { name: 'docker', displayName: 'Docker 引擎', description: 'Docker CE', enabled: true, running: true, pid: 3456, uptime: 864000 },
    { name: 'tailscaled', displayName: 'Tailscale', description: 'Tailscale Daemon', enabled: true, running: true, pid: 4567, uptime: 864000 },
    { name: 'vsftpd', displayName: 'FTP 服务', description: 'vsftpd', enabled: false, running: false, pid: null, uptime: null },
    { name: 'nginx', displayName: 'Nginx 反代', description: 'Nginx', enabled: true, running: true, pid: 5678, uptime: 864000 },
    { name: 'smartd', displayName: 'SMART 监控', description: 'smartmontools', enabled: true, running: true, pid: 6789, uptime: 864000 },
  ];
}

export function demoAbout(): AboutInfo {
  return {
    version: '0.1.0',
    buildDate: '2026-07-27',
    nodeVersion: 'v22.16.0',
    osVersion: 'Debian 13 (Trixie)',
    kernel: 'Linux 6.12.0-trixie',
    cpuModel: 'AMD Ryzen 7 5800X 8-Core Processor',
    cpuCores: 16,
    totalMemoryBytes: 32 * 1024 ** 3,
    hostname: 'naisys-node-01',
    uptimeSeconds: 1287645,
    dataRoot: '/data',
    license: 'MIT',
  };
}

export function demoLogSources(): SettingsLogSource[] {
  return [
    { id: 'system', name: '系统日志', description: 'journalctl 系统日志', sizeBytes: 52 * 1024 * 1024 },
    { id: 'auth', name: '认证日志', description: 'SSH / PAM 认证记录', sizeBytes: 8 * 1024 * 1024 },
    { id: 'naisys', name: 'NAISys 日志', description: 'NAISys 后端服务日志', sizeBytes: 12 * 1024 * 1024 },
    { id: 'docker', name: 'Docker 日志', description: 'Docker 引擎日志', sizeBytes: 128 * 1024 * 1024 },
    { id: 'smartd', name: 'SMART 日志', description: '磁盘健康监控日志', sizeBytes: 2 * 1024 * 1024 },
  ];
}

export function demoSettingsLogs(source: string): SettingsLogLine[] {
  const base: SettingsLogLine[] = [
    { timestamp: '2026-07-27T22:10:01Z', level: 'info', source, message: '服务启动完成，监听 127.0.0.1:3000' },
    { timestamp: '2026-07-27T22:10:03Z', level: 'warn', source, message: '/dev/sdc SMART 健康检查未通过' },
    { timestamp: '2026-07-27T22:10:05Z', level: 'info', source, message: '容器 ollama 启动成功' },
    { timestamp: '2026-07-27T22:10:08Z', level: 'info', source, message: 'Tailscale 节点同步完成，39/112 在线' },
    { timestamp: '2026-07-27T22:10:12Z', level: 'error', source, message: '备份任务 db-daily 执行失败：目标不可达' },
    { timestamp: '2026-07-27T22:10:15Z', level: 'info', source, message: '用户 kane 登录成功 (192.168.50.22)' },
    { timestamp: '2026-07-27T22:10:20Z', level: 'info', source, message: '存储池 data-pool scrub 完成，0 错误' },
    { timestamp: '2026-07-27T22:10:25Z', level: 'warn', source, message: '磁盘 /dev/sdb 温度 49°C 超过阈值' },
    { timestamp: '2026-07-27T22:10:30Z', level: 'info', source, message: 'Nginx 配置重载成功' },
    { timestamp: '2026-07-27T22:10:35Z', level: 'info', source, message: '定时任务 log-cleanup 执行完成' },
  ];
  return base;
}
