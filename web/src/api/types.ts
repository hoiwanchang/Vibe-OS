/**
 * API 类型定义 — 与后端 src/modules 各模块的 types 文件保持镜像
 * 后端 bigint 字段以字符串形式传输，此处统一为 string
 */

/** 统一响应包装 */
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
}

/* ---------- 系统 ---------- */

export interface HealthInfo {
  service: string;
  version: string;
  timestamp: string;
}

export interface StoragePool {
  device: string;
  mountPoint: string;
  fsType: string;
  totalBytes: number;
  freeBytes: number;
  availableBytes: number;
  usedBytes: number;
  usedPercent: number;
}

export interface SystemOverview {
  timestamp: string;
  system: {
    hostname: string;
    platform: string;
    arch: string;
    cpuModel: string;
    cpuCores: number;
    uptimeSeconds: number;
    loadAvg: [number, number, number];
    nodeVersion: string;
  };
  cpu: { usagePercent: number; cores: number };
  memory: {
    timestamp: string;
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usedPercent: number;
  };
  storage: StoragePool[];
}

/* ---------- 硬件健康 ---------- */

export interface DiskHealthEntry {
  device: string;
  healthy: boolean;
  temperature: number | null;
  powerOnHours: number | null;
  model: string | null;
  serial: string | null;
  transport: string | null;
  sizeBytes: string;
}

export interface DiskHealthResponse {
  timestamp: string;
  totalDisks: number;
  healthyDisks: number;
  disks: DiskHealthEntry[];
}

export interface NetworkDriverInfo {
  driver: string;
  vendor: string;
  product: string;
  loaded: boolean;
  version: string | null;
  firmware: string | null;
  pciDevices: string[];
}

export interface NetworkInterfaceInfo {
  name: string;
  linkDetected: boolean;
  speed: string | null;
  duplex: string | null;
  driver: string | null;
}

export interface NetworkDriversResponse {
  timestamp: string;
  drivers: NetworkDriverInfo[];
  loadedCount: number;
  interfaces: NetworkInterfaceInfo[];
}

/* ---------- 容器 ---------- */

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  createdAt: string;
}

export interface ContainerDeployRequest {
  name: string;
  image: string;
  ports?: Array<{ host: number; container: number }>;
  env?: Record<string, string>;
  volumes?: Array<{ host: string; container: string; readonly?: boolean }>;
  memoryLimit?: string;
  cpuLimit?: number;
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  network?: string;
}

export interface ContainerDeployResponse {
  containerId: string;
  name: string;
  image: string;
  status: string;
}

export interface AppDirsInitResponse {
  appDir: string;
  createdDirs: string[];
}

export interface ContainerLogResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/* ---------- Tailscale ---------- */

export interface TailscalePeer {
  id: string;
  hostname: string;
  ips: string[];
  os: string;
  online: boolean;
  active: boolean;
}

export interface TailscaleStatusResponse {
  timestamp: string;
  available: boolean;
  status: {
    backendState: string;
    self: {
      hostname: string;
      ips: string[];
      os: string;
      online: boolean;
    } | null;
    peers: TailscalePeer[];
    error: string | null;
  };
  subnetRoutes: Array<{ cidr: string; advertised: boolean; approved: boolean }>;
}

/* ---------- 用户 ---------- */

export interface ManagedUser {
  uid: number;
  username: string;
  dataDir: string;
  dirExists: boolean;
  usedBytes: string;
  quotaBytes: string;
  usagePercent: number;
}

export interface UserListResponse {
  timestamp: string;
  count: number;
  users: ManagedUser[];
}

export interface CreateUserRequest {
  username: string;
  uid?: number;
  quotaBytes?: string;
}

export interface CreateUserResponse {
  uid: number;
  username: string;
  dataDir: string;
  createdDirs: string[];
  quotaSet: boolean;
}

export interface UserQuotaInfo {
  uid: number;
  dataDir: string;
  usedBytes: string;
  quotaBytes: string;
  usagePercent: number;
  subdirs: Array<{ name: string; usedBytes: string }>;
}
