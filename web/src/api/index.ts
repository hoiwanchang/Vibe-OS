/**
 * API 端点集合 — 按后端模块分组
 * 所有函数统一走 request()，网络不可达时降级为演示数据
 */
import { request } from './client';
import * as demo from './demo-data';
import type {
  AddDownloadRequest,
  AnalyzeRepoRequest,
  AnalyzeRepoResult,
  AppDirsInitResponse,
  DeployCustomRequest,
  DeployFromRegistryRequest,
  DeployResponse,
  InstalledAppWithStatus,
  LlmConfig,
  RegistryApp,
  BackupExecution,
  BackupJob,
  ContainerDeployRequest,
  ContainerDeployResponse,
  ContainerInfo,
  ContainerLogResult,
  CreateBackupJobRequest,
  CreatePoolRequest,
  CreateScheduledJobRequest,
  CreateShareRequest,
  CreateUserRequest,
  CreateUserResponse,
  DiskHealthResponse,
  DiskSmartDetail,
  DownloadTask,
  CertInfo,
  CertStatus,
  SshKeysResult,
  SshPublicKey,
  GeneratedSshKey,
  DnsConfig,
  FileCopyResult,
  FileDeleteResult,
  FileListResult,
  FileReadResult,
  FileUploadResult,
  FileWriteResult,
  FirewallRule,
  FirewallRuleRequest,
  HealthInfo,
  InterfaceConfigRequest,
  JobExecution,
  ListeningPort,
  NetInterface,
  NetworkDriversResponse,
  NotificationChannel,
  NotificationItem,
  NotificationListResponse,
  NotificationSettings,
  PhysicalDisk,
  ScheduledJob,
  ScrubStatus,
  ShareConnection,
  ShareInfo,
  ShareStatusResponse,
  SnapshotInfo,
  StoragePoolInfo,
  SystemOverview,
  TailscaleLoginRequest,
  TailscaleLoginResponse,
  TailscaleManageReport,
  TailscalePrefs,
  TailscaleStatusResponse,
  TrashListResult,
  UserListResponse,
  UserQuotaInfo,
  WolDevice,
  AboutInfo,
  ManagedService,
  SettingsLogLine,
  SettingsLogSource,
  SystemSettings,
  VersionListResult,
  VersionPolicyConfig,
  VersionRestoreResult,
  VersionDeleteResult,
  SearchResult,
  SearchStatus,
  FilePreviewResult,
} from './types';

/* ---------- 系统 / 指标 ---------- */

export const systemApi = {
  /** 健康检查 */
  health: () => request<HealthInfo>({ url: '/health' }, demo.demoHealth),

  /** 系统概览（CPU/内存/存储池聚合） */
  overview: () =>
    request<SystemOverview>({ url: '/metrics/overview' }, demo.demoOverview),

  /** 磁盘 SMART 健康 */
  diskHealth: () =>
    request<DiskHealthResponse>(
      { url: '/hardware/disk-health' },
      demo.demoDiskHealth,
    ),

  /** 网卡驱动与链路状态 */
  networkDrivers: () =>
    request<NetworkDriversResponse>(
      { url: '/hardware/network-drivers' },
      demo.demoNetworkDrivers,
    ),
};

/* ---------- 容器 / AI 应用 ---------- */

export const containerApi = {
  /** 容器列表 */
  list: () =>
    request<ContainerInfo[]>(
      { url: '/container/list' },
      demo.demoContainers,
    ),

  /** 部署容器 */
  deploy: (payload: ContainerDeployRequest) =>
    request<ContainerDeployResponse>({
      url: '/container/deploy',
      method: 'post',
      data: payload,
    }),

  /** 初始化应用数据目录 /data/vibeos/{appname}/ */
  initDirs: (appname: string) =>
    request<AppDirsInitResponse>({
      url: '/container/init-dirs',
      method: 'post',
      data: { appname },
    }),

  /** 重启容器 */
  restart: (name: string) =>
    request<{ name: string; status: string }>({
      url: `/container/${encodeURIComponent(name)}/restart`,
      method: 'post',
    }),

  /** 停止容器 */
  stop: (name: string) =>
    request<{ name: string; status: string }>({
      url: `/container/${encodeURIComponent(name)}/stop`,
      method: 'post',
    }),

  /** 删除容器 */
  remove: (name: string, force = false) =>
    request<{ name: string; status: string }>({
      url: `/container/${encodeURIComponent(name)}`,
      method: 'delete',
      params: force ? { force: 'true' } : undefined,
    }),

  /** 容器日志 */
  logs: (name: string, tail = 200) =>
    request<ContainerLogResult>(
      {
        url: `/container/${encodeURIComponent(name)}/logs`,
        params: { tail },
      },
      () => demo.demoLogs(name),
    ),
};

/* ---------- Tailscale ---------- */

export const tailscaleApi = {
  /** 节点状态 */
  status: () =>
    request<TailscaleStatusResponse>(
      { url: '/tailscale/status' },
      demo.demoTailscale,
    ),

  /** 下发 ACL 策略 */
  pushAcl: (policy: Record<string, unknown>) =>
    request<{ status: string }>({
      url: '/tailscale/acl',
      method: 'post',
      data: policy,
    }),

  /** 配置 Subnet Router */
  subnetRouter: (subnets: string[]) =>
    request<{ subnets: string[]; status: string }>({
      url: '/tailscale/subnet-router',
      method: 'post',
      data: { subnets },
    }),

  /** 管理综合报告（状态 + 账户列表 + 偏好设置） */
  manage: () => request<TailscaleManageReport>({ url: '/tailscale/manage' }),

  /** 登录控制平面（支持第三方 headscale 服务器） */
  login: (payload: TailscaleLoginRequest) =>
    request<TailscaleLoginResponse>({
      url: '/tailscale/login',
      method: 'post',
      data: payload,
    }),

  /** 登出当前账户 */
  logout: () =>
    request<{ status: string }>({ url: '/tailscale/logout', method: 'post' }),

  /** 切换激活账户 */
  switchAccount: (id: string) =>
    request<TailscaleLoginResponse>({
      url: `/tailscale/accounts/${encodeURIComponent(id)}/switch`,
      method: 'post',
    }),

  /** 移除已登记账户 */
  removeAccount: (id: string) =>
    request<{ status: string }>({
      url: `/tailscale/accounts/${encodeURIComponent(id)}`,
      method: 'delete',
    }),

  /** 应用偏好设置（exit node / accept routes 等） */
  setPrefs: (prefs: Partial<TailscalePrefs>) =>
    request<{ status: string }>({
      url: '/tailscale/prefs',
      method: 'post',
      data: prefs,
    }),
};

/* ---------- 用户 ---------- */

export const userApi = {
  /** 受管用户列表 */
  list: () => request<UserListResponse>({ url: '/users' }, demo.demoUsers),

  /** 创建用户数据空间 */
  create: (payload: CreateUserRequest) =>
    request<CreateUserResponse>({
      url: '/users',
      method: 'post',
      data: payload,
    }),

  /** 查询用户配额 */
  quota: (uid: number) =>
    request<UserQuotaInfo>({ url: `/user/${uid}/quota` }),

  /** 初始化用户空间 */
  initSpace: (uid: number, quotaBytes?: string) =>
    request<UserQuotaInfo>({
      url: `/user/${uid}/init`,
      method: 'post',
      data: quotaBytes ? { quotaBytes } : {},
    }),
};

/* ---------- 文件管理器 ---------- */

export const filesApi = {
  /** 目录列表 */
  list: (uid: number, path = '') =>
    request<FileListResult>(
      { url: '/files/list', params: { uid, path } },
      () => demo.demoFileList(path),
    ),

  /** 读取文件内容 */
  read: (uid: number, path: string) =>
    request<FileReadResult>(
      { url: '/files/read', params: { uid, path } },
      () => demo.demoFileRead(path),
    ),

  /** 新建文件夹 */
  mkdir: (uid: number, path: string) =>
    request<{ created: string }>({
      url: '/files/mkdir',
      method: 'post',
      data: { uid, path },
    }),

  /** 写入文件内容 */
  write: (uid: number, path: string, content: string) =>
    request<FileWriteResult>({
      url: '/files/write',
      method: 'post',
      data: { uid, path, content },
    }),

  /** 重命名 */
  rename: (uid: number, path: string, newName: string) =>
    request<{ renamed: string; newPath: string }>({
      url: '/files/rename',
      method: 'post',
      data: { uid, path, newName },
    }),

  /** 删除（默认移入回收站，permanent=true 永久删除） */
  remove: (uid: number, path: string, permanent = false) =>
    request<FileDeleteResult>({
      url: '/files/delete',
      method: 'delete',
      data: { uid, path, permanent },
    }),

  /** 复制 */
  copy: (uid: number, src: string, dest: string) =>
    request<FileCopyResult>({
      url: '/files/copy',
      method: 'post',
      data: { uid, src, dest },
    }),

  /** 下载（返回 blob 流地址，由调用方触发浏览器下载） */
  downloadUrl: (uid: number, path: string) =>
    `/api/files/download?uid=${uid}&path=${encodeURIComponent(path)}`,

  /** 上传单个文件（multipart/form-data） */
  upload: (uid: number, targetDir: string, file: File) => {
    const form = new FormData();
    form.append('uid', String(uid));
    form.append('path', targetDir);
    form.append('file', file);
    return request<FileUploadResult>({
      url: '/files/upload',
      method: 'post',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** 回收站列表 */
  trash: (uid: number) =>
    request<TrashListResult>(
      { url: '/files/trash', params: { uid } },
      demo.demoTrashList,
    ),

  /** 清空回收站 */
  emptyTrash: (uid: number) =>
    request<{ emptied: boolean }>({
      url: '/files/trash/empty',
      method: 'delete',
      params: { uid },
    }),

  /* ---------- Phase 1: 版本控制 ---------- */

  /** 列出文件版本历史 */
  versions: (uid: number, path: string) =>
    request<VersionListResult>(
      { url: '/files/versions', params: { uid, path } },
      () => demo.demoVersionList(path),
    ),

  /** 版本下载 URL */
  versionDownloadUrl: (uid: number, path: string, version: number) =>
    `/api/files/versions/download?uid=${uid}&path=${encodeURIComponent(path)}&version=${version}`,

  /** 恢复指定版本 */
  restoreVersion: (uid: number, path: string, version: number) =>
    request<VersionRestoreResult>({
      url: '/files/versions/restore',
      method: 'post',
      data: { uid, path, version },
    }),

  /** 删除指定版本 */
  deleteVersion: (uid: number, path: string, version: number) =>
    request<VersionDeleteResult>({
      url: '/files/versions',
      method: 'delete',
      params: { uid, path, version },
    }),

  /** 获取版本策略 */
  versionPolicy: (share: string) =>
    request<VersionPolicyConfig>(
      { url: '/files/versions/policy', params: { share } },
      () => demo.demoVersionPolicy(),
    ),

  /** 设置版本策略 */
  setVersionPolicy: (share: string, policy: Partial<VersionPolicyConfig>) =>
    request<VersionPolicyConfig>({
      url: '/files/versions/policy',
      method: 'put',
      data: { share, ...policy },
    }),

  /* ---------- Phase 1: 预览与缩略图 ---------- */

  /** 获取文件预览（按 MIME 分发） */
  preview: (uid: number, path: string) =>
    request<FilePreviewResult>(
      { url: '/files/preview', params: { uid, path } },
      () => demo.demoFilePreview(path),
    ),

  /** 缩略图 URL（图片文件 256px） */
  thumbnailUrl: (uid: number, path: string) =>
    `/api/files/thumbnail?uid=${uid}&path=${encodeURIComponent(path)}`,
};

/* ---------- Phase 1: 全文搜索 ---------- */

export const searchApi = {
  /** 全文搜索 */
  search: (params: {
    uid: number;
    q: string;
    type?: string;
    path?: string;
    from?: string;
    to?: string;
    page?: number;
    size?: number;
  }) =>
    request<SearchResult>(
      { url: '/search', params },
      () => demo.demoSearchResult(params.q),
    ),

  /** 索引状态 */
  status: (uid: number) =>
    request<SearchStatus>(
      { url: '/search/status', params: { uid } },
      () => demo.demoSearchStatus(),
    ),

  /** 手动重建索引 */
  reindex: (uid: number) =>
    request<{ indexed: number; durationMs: number }>({
      url: '/search/reindex',
      method: 'post',
      data: { uid },
    }),
};

/* ---------- 存储池 ---------- */

export const storageApi = {
  /** 物理磁盘列表 */
  disks: async (): Promise<PhysicalDisk[]> => {
    const res = await request<{ disks: PhysicalDisk[] }>({ url: '/storage/disks' }, () => ({ disks: demo.demoDisks() }));
    return res.disks;
  },

  /** 存储池列表 */
  pools: async (): Promise<StoragePoolInfo[]> => {
    const res = await request<{ pools: StoragePoolInfo[] }>({ url: '/storage/pools' }, () => ({ pools: demo.demoPools() }));
    return res.pools;
  },

  /** 创建存储池 */
  createPool: async (payload: CreatePoolRequest): Promise<StoragePoolInfo> => {
    const res = await request<{ pool: StoragePoolInfo }>({ url: '/storage/pools', method: 'post', data: payload });
    return res.pool;
  },

  /** 销毁存储池 */
  destroyPool: (name: string) =>
    request<{ destroyed: string }>({
      url: `/storage/pools/${encodeURIComponent(name)}`,
      method: 'delete',
    }),

  /** 扩容存储池 */
  expandPool: async (name: string, disks: string[]): Promise<StoragePoolInfo> => {
    const res = await request<{ pool: StoragePoolInfo }>({
      url: `/storage/pools/${encodeURIComponent(name)}/expand`,
      method: 'post',
      data: { disks },
    });
    return res.pool;
  },

  /** 池内磁盘 SMART 详情 */
  poolSmart: async (name: string): Promise<DiskSmartDetail[]> => {
    const res = await request<{ disks: DiskSmartDetail[] }>(
      { url: `/storage/pools/${encodeURIComponent(name)}/smart` },
      () => ({ disks: demo.demoPoolSmart(name) }),
    );
    return res.disks;
  },

  /** 启动 Scrub */
  startScrub: (name: string) =>
    request<{ started: boolean }>({
      url: `/storage/pools/${encodeURIComponent(name)}/scrub`,
      method: 'post',
    }),

  /** Scrub 状态 */
  scrubStatus: (name: string) =>
    request<ScrubStatus>(
      { url: `/storage/pools/${encodeURIComponent(name)}/scrub/status` },
      demo.demoScrubStatus,
    ),
};

/* ---------- 共享文件夹 ---------- */

export const sharingApi = {
  /** 共享列表 */
  list: async (): Promise<ShareInfo[]> => {
    const res = await request<{ shares: ShareInfo[] }>({ url: '/sharing' }, () => ({ shares: demo.demoShares() }));
    return res.shares;
  },

  /** 创建共享 */
  create: async (payload: CreateShareRequest): Promise<ShareInfo> => {
    const res = await request<{ share: ShareInfo }>({ url: '/sharing', method: 'post', data: payload });
    return res.share;
  },

  /** 更新共享 */
  update: async (name: string, payload: Partial<CreateShareRequest>): Promise<ShareInfo> => {
    const res = await request<{ share: ShareInfo }>({
      url: `/sharing/${encodeURIComponent(name)}`,
      method: 'put',
      data: payload,
    });
    return res.share;
  },

  /** 删除共享 */
  remove: (name: string) =>
    request<{ removed: string }>({
      url: `/sharing/${encodeURIComponent(name)}`,
      method: 'delete',
    }),

  /** 共享状态（运行状态 + 连接详情） */
  status: async (name: string): Promise<ShareStatusResponse> => {
    const res = await request<{ activeConnections: ShareConnection[] }>(
      { url: `/sharing/${encodeURIComponent(name)}/status` },
      () => ({ activeConnections: demo.demoShareStatus(name).connections }),
    );
    return { name, running: true, connections: res.activeConnections };
  },

  /** 重启共享服务 */
  restart: (name: string) =>
    request<{ restarted: string }>({
      url: `/sharing/${encodeURIComponent(name)}/restart`,
      method: 'post',
    }),
};

/* ---------- 备份与快照 ---------- */

export const backupApi = {
  /** 备份任务列表 */
  jobs: async (): Promise<BackupJob[]> => {
    const res = await request<{ jobs: BackupJob[] }>({ url: '/backup/jobs' }, () => ({ jobs: demo.demoBackupJobs() }));
    return res.jobs;
  },

  /** 创建备份任务 */
  createJob: async (payload: CreateBackupJobRequest): Promise<BackupJob> => {
    const res = await request<{ job: BackupJob }>({ url: '/backup/jobs', method: 'post', data: payload });
    return res.job;
  },

  /** 立即执行备份任务 */
  runJob: async (id: string): Promise<BackupExecution> => {
    const res = await request<{ execution: BackupExecution }>({
      url: `/backup/jobs/${encodeURIComponent(id)}/run`,
      method: 'post',
    });
    return res.execution;
  },

  /** 删除备份任务 */
  deleteJob: (id: string) =>
    request<{ deleted: string }>({
      url: `/backup/jobs/${encodeURIComponent(id)}`,
      method: 'delete',
    }),

  /** 备份执行历史 */
  history: async (id: string): Promise<BackupExecution[]> => {
    const res = await request<{ executions: BackupExecution[] }>(
      { url: `/backup/jobs/${encodeURIComponent(id)}/history` },
      () => ({ executions: demo.demoBackupHistory(id) }),
    );
    return res.executions;
  },

  /** 恢复备份 */
  restore: (id: string, executionId: string, targetPath?: string) =>
    request<{ restoring: boolean }>({
      url: `/backup/jobs/${encodeURIComponent(id)}/restore`,
      method: 'post',
      data: { executionId, targetPath },
    }),

  /** 快照列表 */
  snapshots: async (): Promise<SnapshotInfo[]> => {
    const res = await request<{ snapshots: SnapshotInfo[] }>({ url: '/backup/snapshots' }, () => ({ snapshots: demo.demoSnapshots() }));
    return res.snapshots;
  },

  /** 创建快照 */
  createSnapshot: async (pool: string, name: string): Promise<SnapshotInfo> => {
    const res = await request<{ snapshot: SnapshotInfo }>({
      url: '/backup/snapshots',
      method: 'post',
      data: { pool, name },
    });
    return res.snapshot;
  },

  /** 删除快照 */
  deleteSnapshot: (name: string) =>
    request<{ deleted: string }>({
      url: `/backup/snapshots/${encodeURIComponent(name)}`,
      method: 'delete',
    }),
};

/* ---------- 下载中心 ---------- */

export const downloadApi = {
  /** 下载任务列表 */
  tasks: async (): Promise<DownloadTask[]> => {
    const res = await request<{ tasks: DownloadTask[] }>({ url: '/download/tasks' }, () => ({ tasks: demo.demoDownloadTasks() }));
    return res.tasks;
  },

  /** 新建下载任务（支持批量 URL） */
  addTask: async (payload: AddDownloadRequest): Promise<string[]> => {
    const res = await request<{ gids: string[] }>({ url: '/download/tasks', method: 'post', data: payload });
    return res.gids;
  },

  /** 删除下载任务 */
  removeTask: (gid: string) =>
    request<{ removed: string }>({
      url: `/download/tasks/${encodeURIComponent(gid)}`,
      method: 'delete',
    }),

  /** 暂停下载任务 */
  pauseTask: (gid: string) =>
    request<{ paused: string }>({
      url: `/download/tasks/${encodeURIComponent(gid)}/pause`,
      method: 'post',
    }),

  /** 恢复下载任务 */
  resumeTask: (gid: string) =>
    request<{ resumed: string }>({
      url: `/download/tasks/${encodeURIComponent(gid)}/resume`,
      method: 'post',
    }),

  /** 单个任务详情 */
  task: async (gid: string): Promise<DownloadTask> => {
    const res = await request<{ task: DownloadTask }>({ url: `/download/tasks/${encodeURIComponent(gid)}` });
    return res.task;
  },

  /** 下载设置 */
  settings: async (): Promise<Record<string, string>> => {
    const res = await request<{ settings: Record<string, string> }>({ url: '/download/settings' }, () => ({ settings: demo.demoDownloadSettings() }));
    return res.settings;
  },

  /** 更新下载设置 */
  updateSettings: async (payload: Record<string, string>): Promise<Record<string, string>> => {
    const res = await request<{ updated: Record<string, string> }>({
      url: '/download/settings',
      method: 'put',
      data: payload,
    });
    return res.updated;
  },
};

/* ---------- 网络配置 ---------- */

export const networkApi = {
  /** 网络接口列表 */
  interfaces: async (): Promise<NetInterface[]> => {
    const res = await request<{ interfaces: NetInterface[] }>({ url: '/network/interfaces' }, () => ({ interfaces: demo.demoNetInterfaces() }));
    return res.interfaces;
  },

  /** 配置接口（DHCP/静态） */
  configureInterface: async (name: string, payload: InterfaceConfigRequest): Promise<NetInterface> => {
    const res = await request<{ interface: NetInterface }>({
      url: `/network/interfaces/${encodeURIComponent(name)}`,
      method: 'put',
      data: payload,
    });
    return res.interface;
  },

  /** DNS 配置 */
  dns: () => request<DnsConfig>({ url: '/network/dns' }),

  /** 更新 DNS */
  setDns: (payload: DnsConfig) =>
    request<{ updated: boolean }>({ url: '/network/dns', method: 'put', data: payload }),

  /** 防火墙规则列表 */
  firewall: async (): Promise<FirewallRule[]> => {
    const res = await request<{ rules: FirewallRule[]; defaultPolicy: Record<string, string> }>(
      { url: '/network/firewall' },
      () => ({ rules: demo.demoFirewallRules(), defaultPolicy: {} }),
    );
    return res.rules;
  },

  /** 添加防火墙规则 */
  addFirewallRule: async (payload: FirewallRuleRequest): Promise<FirewallRule> => {
    const res = await request<{ rule: FirewallRule }>({ url: '/network/firewall', method: 'post', data: payload });
    return res.rule;
  },

  /** 删除防火墙规则 */
  removeFirewallRule: (id: string) =>
    request<{ removed: string }>({
      url: `/network/firewall/${encodeURIComponent(id)}`,
      method: 'delete',
    }),

  /** 监听端口列表 */
  ports: async (): Promise<ListeningPort[]> => {
    const res = await request<{ ports: ListeningPort[] }>({ url: '/network/ports' }, () => ({ ports: demo.demoListeningPorts() }));
    return res.ports;
  },

  /** WoL 设备列表 */
  wolDevices: async (): Promise<WolDevice[]> => {
    const res = await request<{ devices: WolDevice[] }>({ url: '/network/wol' }, () => ({ devices: demo.demoWolDevices() }));
    return res.devices;
  },

  /** 发送 WoL 魔术包 */
  sendWol: (mac: string, broadcast?: string) =>
    request<{ sent: boolean; mac: string }>({
      url: '/network/wol',
      method: 'post',
      data: { mac, broadcast },
    }),
};

/* ---------- 通知 ---------- */

export const notificationApi = {
  /** 通知列表（分页 + 可选严重级别过滤） */
  list: async (limit = 20, offset = 0, severity?: string): Promise<NotificationListResponse> => {
    const res = await request<{ notifications: NotificationItem[]; total: number }>(
      { url: '/notifications', params: { limit, offset, severity } },
      () => {
        const d = demo.demoNotifications(limit, offset);
        return { notifications: d.notifications, total: d.total };
      },
    );
    return { notifications: res.notifications, total: res.total, unread: 0 };
  },

  /** 标记单条已读 */
  markRead: (id: string) =>
    request<{ updated: boolean }>({
      url: `/notifications/${encodeURIComponent(id)}/read`,
      method: 'post',
    }),

  /** 全部标记已读 */
  markAllRead: () =>
    request<{ updated: number }>({ url: '/notifications/read-all', method: 'post' }),

  /** 删除通知 */
  remove: (id: string) =>
    request<{ removed: string }>({
      url: `/notifications/${encodeURIComponent(id)}`,
      method: 'delete',
    }),

  /** 通知设置 */
  settings: async (): Promise<NotificationSettings> => {
    const res = await request<{ channels: NotificationChannel[] }>(
      { url: '/notifications/settings' },
      () => ({ channels: demo.demoNotificationSettings().channels }),
    );
    return { channels: res.channels };
  },

  /** 更新通知设置 */
  updateSettings: (payload: NotificationSettings) =>
    request<{ updated: boolean }>({
      url: '/notifications/settings',
      method: 'put',
      data: payload,
    }),

  /** 未读计数 */
  unreadCount: async (): Promise<{ unread: number }> => {
    const res = await request<{ count: number }>(
      { url: '/notifications/unread-count' },
      () => ({ count: demo.demoUnreadCount().unread }),
    );
    return { unread: res.count };
  },
};

/* ---------- 计划任务 ---------- */

export const schedulerApi = {
  /** 计划任务列表 */
  jobs: async (): Promise<ScheduledJob[]> => {
    const res = await request<{ jobs: ScheduledJob[] }>({ url: '/scheduler/jobs' }, () => ({ jobs: demo.demoScheduledJobs() }));
    return res.jobs;
  },

  /** 创建计划任务 */
  createJob: async (payload: CreateScheduledJobRequest): Promise<ScheduledJob> => {
    const res = await request<{ job: ScheduledJob }>({ url: '/scheduler/jobs', method: 'post', data: payload });
    return res.job;
  },

  /** 更新计划任务 */
  updateJob: async (id: string, payload: Partial<CreateScheduledJobRequest>): Promise<ScheduledJob> => {
    const res = await request<{ job: ScheduledJob }>({
      url: `/scheduler/jobs/${encodeURIComponent(id)}`,
      method: 'put',
      data: payload,
    });
    return res.job;
  },

  /** 删除计划任务 */
  deleteJob: (id: string) =>
    request<{ deleted: string }>({
      url: `/scheduler/jobs/${encodeURIComponent(id)}`,
      method: 'delete',
    }),

  /** 立即执行计划任务 */
  runJob: async (id: string): Promise<JobExecution> => {
    const res = await request<{ execution: JobExecution }>({
      url: `/scheduler/jobs/${encodeURIComponent(id)}/run`,
      method: 'post',
    });
    return res.execution;
  },

  /** 执行历史 */
  history: async (id: string): Promise<JobExecution[]> => {
    const res = await request<{ executions: JobExecution[] }>(
      { url: `/scheduler/jobs/${encodeURIComponent(id)}/history` },
      () => ({ executions: demo.demoJobHistory(id) }),
    );
    return res.executions;
  },
};

/* ---------- 应用中心 ---------- */

export const appsApi = {
  /** 注册表列表 */
  registry: async (): Promise<RegistryApp[]> => {
    const res = await request<{ apps: RegistryApp[] }>(
      { url: '/apps/registry' },
      () => ({ apps: demo.demoRegistryApps() }),
    );
    return res.apps;
  },

  /** 单个注册表应用 */
  registryDetail: async (id: string): Promise<RegistryApp> => {
    const res = await request<{ app: RegistryApp }>({ url: `/apps/registry/${encodeURIComponent(id)}` });
    return res.app;
  },

  /** 从注册表部署 */
  deploy: (payload: DeployFromRegistryRequest) =>
    request<DeployResponse>({ url: '/apps/deploy', method: 'post', data: payload }),

  /** 自定义部署 */
  deployCustom: (payload: DeployCustomRequest) =>
    request<DeployResponse>({ url: '/apps/deploy-custom', method: 'post', data: payload }),

  /** 已安装应用列表 */
  installed: async (): Promise<InstalledAppWithStatus[]> => {
    const res = await request<{ apps: InstalledAppWithStatus[] }>(
      { url: '/apps/installed' },
      () => ({ apps: demo.demoInstalledApps() }),
    );
    return res.apps;
  },

  /** 卸载应用 */
  uninstall: (id: string) =>
    request<{ removed: string }>({ url: `/apps/installed/${encodeURIComponent(id)}`, method: 'delete' }),

  /** 重启应用 */
  restart: (id: string) =>
    request<{ restarted: string }>({ url: `/apps/installed/${encodeURIComponent(id)}/restart`, method: 'post' }),

  /** 停止应用 */
  stop: (id: string) =>
    request<{ stopped: string }>({ url: `/apps/installed/${encodeURIComponent(id)}/stop`, method: 'post' }),

  /** 获取 LLM 配置 */
  llmConfig: () =>
    request<{ config: LlmConfig | null; configured: boolean }>({ url: '/apps/llm-config' }),

  /** 保存 LLM 配置 */
  setLlmConfig: (payload: LlmConfig) =>
    request<{ updated: boolean }>({ url: '/apps/llm-config', method: 'put', data: payload }),

  /** 分析 Git 仓库 */
  analyze: (payload: AnalyzeRepoRequest) =>
    request<AnalyzeRepoResult>({ url: '/apps/analyze', method: 'post', data: payload }),
};

/* ---------- 系统设置中心 ---------- */

export const settingsApi = {
  /** 完整配置 */
  getAll: () =>
    request<SystemSettings>({ url: '/settings' }, demo.demoSettings),

  /** 单分区 */
  getSection: (section: string) =>
    request<Record<string, unknown>>({ url: `/settings/${section}` }),

  /** 更新分区 */
  updateSection: (section: string, data: Record<string, unknown>) =>
    request<{ updated: string; applied: boolean }>({
      url: `/settings/${section}`,
      method: 'put',
      data,
    }),

  /** 服务列表 */
  services: () =>
    request<{ services: ManagedService[] }>(
      { url: '/settings/services' },
      () => ({ services: demo.demoServices() }),
    ),

  /** 开关服务 */
  toggleService: (name: string, enabled: boolean) =>
    request<{ name: string; enabled: boolean; running: boolean }>({
      url: `/settings/services/${encodeURIComponent(name)}/toggle`,
      method: 'post',
      data: { enabled },
    }),

  /** 重启服务 */
  restartService: (name: string) =>
    request<{ name: string; running: boolean; pid: number | null }>({
      url: `/settings/services/${encodeURIComponent(name)}/restart`,
      method: 'post',
    }),

  /** 关于 */
  about: () =>
    request<AboutInfo>({ url: '/settings/about' }, demo.demoAbout),

  /** 日志源 */
  logSources: () =>
    request<{ sources: SettingsLogSource[] }>(
      { url: '/settings/logs/sources' },
      () => ({ sources: demo.demoLogSources() }),
    ),

  /** 读取日志 */
  logs: (source: string, lines = 200, level?: string) =>
    request<{ lines: SettingsLogLine[]; total: number; source: string }>(
      { url: '/settings/logs', params: { source, lines, level } },
      () => ({ lines: demo.demoSettingsLogs(source), total: 200, source }),
    ),

  /** 清空日志 */
  clearLogs: (source: string) =>
    request<{ cleared: string }>({
      url: '/settings/logs/clear',
      method: 'delete',
      params: { source },
    }),

  /** 导出诊断包 */
  exportDiagnostics: () =>
    request<{ path: string; sizeBytes: number }>({
      url: '/settings/logs/export',
      method: 'post',
    }),

  /** 检查更新 */
  checkUpdate: () =>
    request<{ updateAvailable: boolean; latestVersion?: string; changelog?: string }>({
      url: '/settings/update/check',
      method: 'post',
    }),

  /** 测试通知 */
  testNotification: (channelType: string) =>
    request<{ sent: boolean; error?: string }>({
      url: '/settings/notification/test',
      method: 'post',
      data: { channelType },
    }),

  /* ---------- TLS 证书管理 ---------- */

  /** 证书状态 */
  certStatus: () =>
    request<CertStatus>(
      { url: '/settings/cert' },
      () => demo.demoCertStatus(),
    ),

  /** 生成自签证书 */
  generateCert: (payload: {
    commonName: string;
    sans: string[];
    days: number;
    keySize: 2048 | 4096;
  }) =>
    request<CertInfo>({
      url: '/settings/cert/generate',
      method: 'post',
      data: payload,
    }),

  /** 导入证书 */
  importCert: (payload: { certPem: string; keyPem: string }) =>
    request<CertInfo>({
      url: '/settings/cert/import',
      method: 'post',
      data: payload,
    }),

  /** 删除证书 */
  deleteCert: () =>
    request<{ removed: boolean }>({
      url: '/settings/cert',
      method: 'delete',
    }),

  /* ---------- SSH 密钥管理 ---------- */

  /** 列举 SSH 公钥 */
  listSshKeys: () =>
    request<SshKeysResult>(
      { url: '/settings/ssh/keys' },
      () => demo.demoSshKeys(),
    ),

  /** 导入 SSH 公钥 */
  importSshKey: (payload: { publicKey: string }) =>
    request<SshPublicKey>({
      url: '/settings/ssh/keys',
      method: 'post',
      data: payload,
    }),

  /** 删除 SSH 公钥（按指纹） */
  deleteSshKey: (fingerprint: string) =>
    request<{ removed: boolean }>({
      url: '/settings/ssh/keys',
      method: 'delete',
      params: { fingerprint },
    }),

  /** 生成 SSH 密钥对 */
  generateSshKey: (payload: {
    type: 'ed25519' | 'rsa';
    bits?: 2048 | 4096;
    comment?: string;
  }) =>
    request<GeneratedSshKey>({
      url: '/settings/ssh/keys/generate',
      method: 'post',
      data: payload,
    }),

  /** 重启系统 */
  reboot: () =>
    request<{ rebooting: boolean }>({ url: '/system/reboot', method: 'post' }),

  /** 关机 */
  shutdown: () =>
    request<{ shuttingDown: boolean }>({ url: '/system/shutdown', method: 'post' }),
};
