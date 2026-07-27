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

/* ---------- Tailscale 多账户 / HeadScale 管理 ---------- */

/** Tailscale 账户（profile）条目 */
export interface TailscaleAccount {
  id: string;
  label: string;
  controlUrl: string;
  loginName: string;
  active: boolean;
}

/** Tailscale 登录请求 */
export interface TailscaleLoginRequest {
  controlUrl?: string;
  authKey?: string;
  label?: string;
  exitNode?: boolean;
  acceptRoutes?: boolean;
}

/** Tailscale 登录响应 */
export interface TailscaleLoginResponse {
  backendState: string;
  authUrl: string | null;
  account: TailscaleAccount;
}

/** Tailscale 偏好设置 */
export interface TailscalePrefs {
  acceptRoutes: boolean;
  exitNode: string;
  exitNodeAllowLanAccess: boolean;
  advertiseExitNode: boolean;
}

/** Tailscale 管理综合报告 */
export interface TailscaleManageReport {
  report: TailscaleStatusResponse;
  accounts: TailscaleAccount[];
  prefs: TailscalePrefs;
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

/* ---------- 文件管理器 ---------- */

export interface FileEntry {
  name: string;
  /** 相对于用户根的路径 */
  path: string;
  type: 'file' | 'directory' | 'symlink';
  /** 字节，目录为 0 */
  size: number;
  /** ISO 8601 */
  modifiedAt: string;
  /** 如 "rwxr-xr-x" */
  permissions: string;
  mimeType?: string;
}

export interface FileListResult {
  entries: FileEntry[];
  path: string;
  total: number;
}

export interface FileReadResult {
  content: string;
  size: number;
  truncated: boolean;
  mimeType: string;
}

export interface FileWriteResult {
  written: string;
  size: number;
}

export interface FileDeleteResult {
  deleted: string;
  method: 'trash' | 'permanent';
}

export interface FileCopyResult {
  copied: string;
  dest: string;
}

export interface FileUploadResult {
  uploaded: string;
  size: number;
}

export interface TrashListResult {
  entries: FileEntry[];
  total: number;
}

/* ---------- 存储池 ---------- */

export interface PhysicalDisk {
  device: string;
  model: string;
  serial: string;
  sizeBytes: number;
  fsType: string | null;
  mountPoint: string | null;
  inPool: string | null;
  smart: { healthy: boolean; temperature: number | null; powerOnHours: number | null };
}

export interface StoragePoolInfo {
  name: string;
  level: string;
  devices: string[];
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
  mountPoint: string;
  state: 'active' | 'degraded' | 'rebuilding' | 'inactive';
  syncProgress?: number;
}

export interface DiskSmartDetail {
  device: string;
  healthy: boolean;
  temperature: number | null;
  powerOnHours: number | null;
  attributes: Record<string, { value: number; worst: number; thresh: number; raw: number }>;
}

export interface ScrubStatus {
  running: boolean;
  progress?: number;
  errors?: number;
}

export interface CreatePoolRequest {
  name: string;
  level: 'raid0' | 'raid1' | 'raid5' | 'raid6' | 'raid10' | 'jbod';
  disks: string[];
}

/* ---------- 共享文件夹 ---------- */

export interface ShareInfo {
  name: string;
  path: string;
  protocol: 'smb' | 'nfs' | 'webdav';
  readonly: boolean;
  validUsers: string[];
  hosts: string[];
  enabled: boolean;
  port?: number;
}

export interface ShareConnection {
  user: string;
  host: string;
  openedAt: string;
  files: number;
}

export interface ShareStatusResponse {
  name: string;
  running: boolean;
  connections: ShareConnection[];
}

export interface CreateShareRequest {
  name: string;
  path: string;
  protocol: 'smb' | 'nfs' | 'webdav';
  readonly: boolean;
  validUsers?: string[];
  hosts?: string[];
  port?: number;
}

/* ---------- 备份与快照 ---------- */

export interface BackupJob {
  id: string;
  name: string;
  source: string;
  target: string;
  type: 'rsync' | 'snapshot' | 'archive';
  schedule: string | null;
  enabled: boolean;
  lastRun: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
}

export interface BackupExecution {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'failed';
  filesTransferred: number;
  bytesTransferred: number;
  error?: string;
}

export interface SnapshotInfo {
  name: string;
  pool: string;
  createdAt: string;
  usedBytes: number;
  referencedBytes: number;
}

export interface CreateBackupJobRequest {
  name: string;
  source: string;
  target: string;
  schedule?: string;
  type: 'rsync' | 'snapshot' | 'archive';
}

/* ---------- 下载中心 ---------- */

export interface DownloadTask {
  gid: string;
  name: string;
  status: 'active' | 'waiting' | 'paused' | 'complete' | 'error' | 'removed';
  totalBytes: number;
  completedBytes: number;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  connections: number;
  eta: number | null;
  dir: string;
  files: Array<{ path: string; length: number; completedLength: number }>;
  error?: string;
  startedAt: string;
  completedAt: string | null;
}

export interface AddDownloadRequest {
  urls: string[];
  targetDir?: string;
  headers?: Record<string, string>;
}

/* ---------- 网络配置 ---------- */

export interface NetInterface {
  name: string;
  type: 'ethernet' | 'wifi' | 'bridge' | 'vlan' | 'loopback';
  state: 'up' | 'down';
  method: 'dhcp' | 'static' | 'manual';
  addresses: Array<{ family: 'inet' | 'inet6'; address: string; prefix: number }>;
  mac: string;
  speed: string | null;
  gateway: string | null;
}

export interface FirewallRule {
  id: string;
  chain: 'input' | 'forward' | 'output';
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  port: number | string | null;
  action: 'accept' | 'drop' | 'reject';
  source: string | null;
  comment: string;
}

export interface ListeningPort {
  protocol: string;
  localAddress: string;
  port: number;
  process: string | null;
  pid: number | null;
}

export interface DnsConfig {
  servers: string[];
  search: string[];
}

export interface InterfaceConfigRequest {
  method: 'dhcp' | 'static';
  ip?: string;
  netmask?: string;
  gateway?: string;
  dns?: string[];
}

export interface FirewallRuleRequest {
  chain: 'input' | 'forward' | 'output';
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  port?: number | string | null;
  action: 'accept' | 'drop' | 'reject';
  source?: string;
  comment?: string;
}

export interface WolDevice {
  name: string;
  mac: string;
  lastWake: string | null;
}

/* ---------- 通知 ---------- */

export interface NotificationItem {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'disk' | 'service' | 'backup' | 'network' | 'security' | 'system';
  title: string;
  detail: string;
  source: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationChannel {
  type: 'webhook' | 'email';
  enabled: boolean;
  url?: string;
  minSeverity: 'info' | 'warning' | 'critical';
}

export interface NotificationSettings {
  channels: NotificationChannel[];
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
  total: number;
  unread: number;
}

/* ---------- 计划任务 ---------- */

export interface ScheduledJob {
  id: string;
  name: string;
  command: string;
  schedule: string;
  enabled: boolean;
  lastRun: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
  nextRun: string | null;
}

export interface JobExecution {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  status: 'running' | 'success' | 'failed';
}

export interface CreateScheduledJobRequest {
  name: string;
  command: string;
  schedule: string;
  enabled?: boolean;
}
