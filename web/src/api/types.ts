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

/* ---------- 应用中心 ---------- */

export interface AppPortMapping {
  host: number;
  container: number;
  protocol?: 'tcp' | 'udp';
}

export interface AppVolumeMapping {
  host: string;
  container: string;
  readonly?: boolean;
}

export interface RegistryApp {
  id: string;
  name: string;
  category: 'media' | 'files' | 'security' | 'tools' | 'monitoring' | 'network' | 'ai' | 'other';
  description: string;
  icon: string;
  image: string;
  ports: AppPortMapping[];
  volumes: AppVolumeMapping[];
  env: Record<string, string>;
  healthcheck?: string;
  homepage?: string;
  dependsOn?: string[];
  postInstallNote?: string;
}

export type InstalledAppStatus = 'running' | 'stopped' | 'error' | 'deploying';

export interface InstalledApp {
  appId: string;
  containerName: string;
  image: string;
  ports: AppPortMapping[];
  volumes: AppVolumeMapping[];
  env: Record<string, string>;
  installedAt: string;
  source: 'registry' | 'custom';
  gitUrl?: string;
}

export interface InstalledAppWithStatus extends InstalledApp {
  status: InstalledAppStatus;
  containerId?: string;
}

export interface DeployFromRegistryRequest {
  appId: string;
  ports?: AppPortMapping[];
  env?: Record<string, string>;
  volumes?: AppVolumeMapping[];
  memoryLimit?: string;
  cpuLimit?: number;
}

export interface DeployCustomRequest {
  name: string;
  image: string;
  ports?: AppPortMapping[];
  volumes?: AppVolumeMapping[];
  env?: Record<string, string>;
  memoryLimit?: string;
  cpuLimit?: number;
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  gitUrl?: string;
}

export interface DeployResponse {
  containerName: string;
  image: string;
  status: string;
  app: InstalledApp;
}

export interface LlmConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AnalyzeRepoRequest {
  gitUrl: string;
  branch?: string;
}

export interface AnalyzeRepoResult {
  name: string;
  image: string;
  ports: AppPortMapping[];
  volumes: AppVolumeMapping[];
  env: Record<string, string>;
  healthcheck?: string;
  analysis: string;
  confidence: number;
  dockerfile?: string;
  composeFile?: string;
}

/* ---------- 系统设置中心 ---------- */

export interface GeneralSettings {
  hostname: string;
  timezone: string;
  locale: string;
  ntpEnabled: boolean;
  ntpServer: string;
  description: string;
}

export interface ManagedService {
  name: string;
  displayName: string;
  description: string;
  enabled: boolean;
  running: boolean;
  pid: number | null;
  uptime: number | null;
}

export interface SecuritySettings {
  httpsEnabled: boolean;
  httpsPort: number;
  httpsCertPath: string;
  httpsKeyPath: string;
  sshEnabled: boolean;
  sshPort: number;
  sshPasswordAuth: boolean;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  ipBlacklist: string[];
  ipWhitelist: string[];
  firewallEnabled: boolean;
  autoSecurityUpdates: boolean;
}

/** TLS 证书解析信息 */
export interface CertInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  fingerprint: string;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  isExpired: boolean;
  isSelfSigned: boolean;
  sans: string[];
}

/** TLS 证书安装状态 */
export interface CertStatus {
  installed: boolean;
  certPath: string;
  keyPath: string;
  info: CertInfo | null;
  error?: string;
}

/** 单条 SSH 公钥信息 */
export interface SshPublicKey {
  fingerprint: string;
  type: string;
  bits: number;
  comment: string;
  raw: string;
  valid: boolean;
}

/** SSH 公钥列表结果 */
export interface SshKeysResult {
  keys: SshPublicKey[];
  targetUser: string;
  keysFile: string;
}

/** 生成的 SSH 密钥对 */
export interface GeneratedSshKey {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
  type: string;
}

export interface StoragePolicySettings {
  diskSpindownMinutes: number;
  hddStandbyEnabled: boolean;
  smartCheckInterval: number;
  smartEmailAlert: boolean;
  trashRetentionDays: number;
  autoDefrag: boolean;
  writeCache: 'enabled' | 'disabled';
}

export interface PowerSettings {
  upsEnabled: boolean;
  upsDevice: string;
  upsShutdownThreshold: number;
  scheduledPowerOn: { enabled: boolean; time: string };
  scheduledShutdown: { enabled: boolean; time: string };
  idleShutdown: { enabled: boolean; minutes: number };
  wakeOnLan: boolean;
}

export interface SettingsNotificationChannel {
  id: string;
  type: 'webhook' | 'email';
  name: string;
  enabled: boolean;
  url?: string;
  emailTo?: string;
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  minSeverity: 'info' | 'warning' | 'critical';
}

export interface SettingsNotificationConfig {
  channels: SettingsNotificationChannel[];
  globalMinSeverity: 'info' | 'warning' | 'critical';
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface UpdateSettings {
  autoCheck: boolean;
  autoInstall: boolean;
  channel: 'stable' | 'beta';
  lastCheck: string | null;
  currentVersion: string;
}

export interface SystemSettings {
  general: GeneralSettings;
  security: SecuritySettings;
  storage: StoragePolicySettings;
  power: PowerSettings;
  notification: SettingsNotificationConfig;
  update: UpdateSettings;
}

export type SettingsSection = keyof SystemSettings;

export interface SettingsLogLine {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

export interface SettingsLogSource {
  id: string;
  name: string;
  description: string;
  sizeBytes: number;
}

export interface AboutInfo {
  version: string;
  buildDate: string;
  nodeVersion: string;
  osVersion: string;
  kernel: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  hostname: string;
  uptimeSeconds: number;
  dataRoot: string;
  license: string;
}

/* ---------- Phase 1: 文件版本控制 ---------- */

export type VersionPolicyMode = 'off' | 'simple' | 'multiversion';

export interface VersionPolicyConfig {
  mode: VersionPolicyMode;
  maxVersions: number;
  maxDays: number;
}

export interface VersionEntry {
  version: number;
  filename: string;
  size: number;
  createdAt: string;
  filePath: string;
}

export interface VersionListResult {
  versions: VersionEntry[];
  path: string;
  total: number;
}

export interface VersionRestoreResult {
  restored: string;
  version: number;
  size: number;
}

export interface VersionDeleteResult {
  deleted: string;
  version: number;
}

/* ---------- Phase 1: 全文搜索 ---------- */

export interface SearchResultItem {
  filename: string;
  path: string;
  size: number;
  mtime: string;
  snippet: string;
}

export interface SearchResult {
  results: SearchResultItem[];
  total: number;
  page: number;
  size: number;
}

export interface SearchStatus {
  indexedFiles: number;
  totalBytes: number;
  lastIndexed: string | null;
}

/* ---------- Phase 1: 文件预览与缩略图 ---------- */

export type PreviewKind = 'image' | 'text' | 'pdf' | 'video' | 'audio' | 'unsupported';

export interface FilePreviewResult {
  kind: PreviewKind;
  mimeType: string;
  size: number;
  content?: string;
  truncated?: boolean;
}

export interface FileThumbnailResult {
  url: string;
  mimeType: string;
  size: number;
  cached: boolean;
}

/* ---------- Phase 2: FTP/SFTP ---------- */

export interface FtpConfig {
  enabled: boolean;
  port: number;
  passivePortMin: number;
  passivePortMax: number;
  anonymousEnabled: boolean;
  tlsEnabled: boolean;
  maxClients: number;
  banner: string;
}

export interface SftpConfig {
  enabled: boolean;
  port: number;
  chrootEnabled: boolean;
}

export interface FtpStatus {
  ftp: { running: boolean; pid: number | null };
  sftp: { running: boolean; pid: number | null };
  config: FtpConfig;
  sftpConfig: SftpConfig;
}

export interface FtpUserPermission {
  uid: number;
  enabled: boolean;
  rootDir: string;
  bandwidthLimitKbps: number;
}

export interface FtpLogEntry {
  timestamp: string;
  user: string;
  ip: string;
  action: string;
  path: string;
  result: 'success' | 'failure';
}

/* ---------- Phase 2: 反向代理 ---------- */

export interface ProxyRule {
  id: string;
  domain: string;
  path: string;
  target: string;
  https: boolean;
  websocket: boolean;
  enabled: boolean;
  createdAt: string;
}

export interface ProxyRuleInput {
  domain: string;
  path: string;
  target: string;
  https?: boolean;
  websocket?: boolean;
  enabled?: boolean;
}

export interface ProxyCert {
  id: string;
  domain: string;
  issuer: string;
  notAfter: string;
  selfSigned: boolean;
}

/* ---------- Phase 2: DDNS ---------- */

export type DdnsProvider = 'cloudflare' | 'aliyun' | 'custom';

export interface DdnsConfig {
  enabled: boolean;
  provider: DdnsProvider;
  domain: string;
  recordName: string;
  apiKey: string;
  apiSecret: string;
  customUrl: string;
  intervalMinutes: number;
}

export interface DdnsStatus {
  enabled: boolean;
  online: boolean;
  currentIp: string | null;
  lastUpdate: string | null;
  lastError: string | null;
}

export interface DdnsHistoryEntry {
  timestamp: string;
  ip: string;
  success: boolean;
  message: string;
}

/* ---------- Phase 3: 2FA / TOTP ---------- */

export interface TwoFactorSetupResult {
  secret: string;
  otpauthUri: string;
  qrCodeDataUri: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  force2fa: boolean;
}

export interface BackupCodesResult {
  codes: string[];
  generatedAt: string;
}

/* ---------- Phase 3: 审计日志 ---------- */

export interface AuditLogEntry {
  id: number;
  uid: number | null;
  username: string;
  method: string;
  path: string;
  ip: string;
  statusCode: number;
  sensitive: boolean;
  timestamp: string;
}

export interface AuditLogQuery {
  user?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export interface AuditLogResult {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  size: number;
}

export interface AuditStats {
  todayTotal: number;
  todayLogins: number;
  todaySensitive: number;
  totalEntries: number;
}

/* ---------- Phase 3: IP 封禁 ---------- */

export interface BannedIpEntry {
  ip: string;
  reason: string;
  bannedAt: string;
  expiresAt: string | null;
  auto: boolean;
}

export interface SecurityPolicy {
  maxAttempts: number;
  banDurationHours: number;
  whitelist: string[];
}

/* ---------- Phase 4: RAID 管理 ---------- */

export type RaidLevel = 'raid0' | 'raid1' | 'raid5' | 'raid6' | 'raid10';
export type RaidState = 'online' | 'degraded' | 'rebuilding' | 'inactive';

export interface RaidArray {
  name: string;
  level: RaidLevel;
  devices: string[];
  spares: string[];
  state: RaidState;
  totalBytes: number;
  usedBytes: number;
  syncProgress: number | null;
}

export interface RaidCreateRequest {
  name: string;
  level: RaidLevel;
  devices: string[];
  spares?: string[];
}

/* ---------- Phase 4: LUKS 卷加密 ---------- */

export interface LuksVolume {
  name: string;
  device: string;
  active: boolean;
  cipher: string;
  keySize: number;
  autoUnlock: boolean;
}

export interface LuksCreateRequest {
  device: string;
  passphrase?: string;
  keyfile?: boolean;
}

/* ---------- Phase 4: SSD 缓存 ---------- */

export type SsdCacheMode = 'read' | 'write' | 'readwrite';

export interface SsdCacheEntry {
  name: string;
  ssdDevice: string;
  poolDevice: string;
  mode: SsdCacheMode;
  hitRate: number;
  temperature: number | null;
  lifePercent: number | null;
}

export interface SsdCacheCreateRequest {
  ssdDevice: string;
  poolDevice: string;
  mode: SsdCacheMode;
}

/* ---------- Phase 4: iSCSI Target ---------- */

export interface IscsiLun {
  lunId: number;
  backingStore: string;
  sizeBytes: number;
}

export interface IscsiTarget {
  iqn: string;
  luns: IscsiLun[];
  connections: number;
  chapEnabled: boolean;
  initiatorWhitelist: string[];
}

export interface IscsiTargetCreateRequest {
  iqn: string;
  luns: Array<{ backingStore: string; sizeBytes: number }>;
  chapUser?: string;
  chapPassword?: string;
  initiatorWhitelist?: string[];
}

/* ---------- Phase 5: DLNA 媒体服务 ---------- */

export type MediaSourceType = 'video' | 'music' | 'photo';

export interface MediaSource {
  path: string;
  type: MediaSourceType;
}

export interface MediaConfig {
  sources: MediaSource[];
  inotify: boolean;
  port: number;
}

export interface MediaStatus {
  running: boolean;
  videoCount: number;
  musicCount: number;
  photoCount: number;
  lastScan: string | null;
}

export interface MediaClient {
  name: string;
  ip: string;
  type: string;
  connectedAt: string;
}

/* ---------- Phase 5: 照片管理 ---------- */

export interface PhotoItem {
  id: string;
  path: string;
  filename: string;
  width: number;
  height: number;
  takenAt: string | null;
  camera: string | null;
  gps: { lat: number; lng: number } | null;
}

export interface PhotoTimelineGroup {
  date: string;
  photos: PhotoItem[];
}

export interface PhotoAlbum {
  id: string;
  name: string;
  description: string;
  coverId: string | null;
  photoCount: number;
  createdAt: string;
}

export interface PhotoShareLink {
  token: string;
  photoIds: string[];
  expiresAt: string;
  url: string;
}

/* ---------- Phase 5: 视频转码 ---------- */

export type TranscodePreset = '1080p' | '720p' | '480p' | 'original';
export type TranscodeHwAccel = 'auto' | 'vaapi' | 'nvenc' | 'none';
export type TranscodeStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TranscodeTask {
  id: string;
  inputPath: string;
  outputPath: string;
  preset: TranscodePreset;
  hwAccel: TranscodeHwAccel;
  status: TranscodeStatus;
  progress: number;
  createdAt: string;
  error: string | null;
}

export interface TranscodeCreateRequest {
  inputPath: string;
  outputPath?: string;
  preset: TranscodePreset;
  hwAccel?: TranscodeHwAccel;
}

export interface HwAccelInfo {
  vaapi: boolean;
  nvenc: boolean;
  recommended: TranscodeHwAccel;
}

/* ---------- Phase 5: 音乐串流 ---------- */

export interface MusicArtist {
  id: string;
  name: string;
  albumCount: number;
  trackCount: number;
}

export interface MusicAlbum {
  id: string;
  name: string;
  artistId: string;
  artistName: string;
  year: number | null;
  coverPath: string | null;
  trackCount: number;
}

export interface MusicTrack {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  albumId: string;
  albumName: string;
  trackNumber: number;
  duration: number;
  format: string;
  path: string;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  trackCount: number;
  createdAt: string;
}

/* ---------- Phase 6: VLAN ---------- */

export interface VlanInterface {
  id: string;
  parentInterface: string;
  vlanId: number;
  ipAddress: string | null;
  state: string;
  mtu: number;
}

export interface VlanCreateRequest {
  parentInterface: string;
  vlanId: number;
  ipAddress?: string;
}

/* ---------- Phase 6: LACP / Bonding ---------- */

export type BondMode = 'balance-rr' | 'active-backup' | '802.3ad';

export interface BondMember {
  name: string;
  state: 'up' | 'down';
  speed: string;
}

export interface BondInterface {
  name: string;
  mode: BondMode;
  members: BondMember[];
  ipAddress: string | null;
  state: string;
  aggregateSpeed: string;
}

export interface BondCreateRequest {
  name: string;
  mode: BondMode;
  members: string[];
}

/* ---------- Phase 6: VPN (WireGuard) ---------- */

export interface VpnPeer {
  publicKey: string;
  name: string;
  allowedIps: string[];
  lastHandshake: string | null;
  transferRx: number;
  transferTx: number;
}

export interface VpnServerStatus {
  running: boolean;
  port: number;
  subnet: string;
  publicKey: string;
  peerCount: number;
}

export interface VpnServerInitRequest {
  port: number;
  subnet: string;
  dns?: string;
}

export interface VpnPeerCreateRequest {
  name: string;
  allowedIps?: string[];
}

/* ---------- Phase 6: QoS ---------- */

export type QosDirection = 'ingress' | 'egress';
export type QosRuleType = 'ip' | 'port' | 'protocol';

export interface QosRule {
  id: string;
  interface: string;
  type: QosRuleType;
  target: string;
  direction: QosDirection;
  rateLimit: string;
  priority: number;
}

export interface QosRuleCreateRequest {
  interface: string;
  type: QosRuleType;
  target: string;
  direction: QosDirection;
  rateLimit: string;
  priority?: number;
}

export interface QosInterfaceStatus {
  interface: string;
  rxBytes: number;
  txBytes: number;
  rxRate: string;
  txRate: string;
}

/* ---------- Phase 6: DNS ---------- */

export type DnsRecordType = 'A' | 'CNAME' | 'PTR';

export interface DnsRecord {
  id: string;
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
}

export interface DnsRecordCreateRequest {
  type: DnsRecordType;
  name: string;
  value: string;
  ttl?: number;
}

export interface DnsServerConfig {
  upstreamServers: string[];
  listenAddress: string;
  cacheSize: number;
  running: boolean;
}

export interface DnsServerConfigUpdateRequest {
  upstreamServers: string[];
  listenAddress?: string;
  cacheSize?: number;
}
