/**
 * API 端点集合 — 按后端模块分组
 * 所有函数统一走 request()，网络不可达时降级为演示数据
 */
import { request } from './client';
import * as demo from './demo-data';
import type {
  AddDownloadRequest,
  AppDirsInitResponse,
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
  TailscaleLoginRequest,
  TailscaleLoginResponse,
  TailscaleManageReport,
  TailscalePrefs,
  TailscaleStatusResponse,
  TrashListResult,
  UserListResponse,
  UserQuotaInfo,
  WolDevice,
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

  /** 初始化应用数据目录 /data/naisys/{appname}/ */
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
};

/* ---------- 存储池 ---------- */

export const storageApi = {
  /** 物理磁盘列表 */
  disks: () => request<PhysicalDisk[]>({ url: '/storage/disks' }, demo.demoDisks),

  /** 存储池列表 */
  pools: () => request<StoragePoolInfo[]>({ url: '/storage/pools' }, demo.demoPools),

  /** 创建存储池 */
  createPool: (payload: CreatePoolRequest) =>
    request<StoragePoolInfo>({ url: '/storage/pools', method: 'post', data: payload }),

  /** 销毁存储池 */
  destroyPool: (name: string) =>
    request<{ destroyed: string }>({
      url: `/storage/pools/${encodeURIComponent(name)}`,
      method: 'delete',
    }),

  /** 扩容存储池 */
  expandPool: (name: string, disks: string[]) =>
    request<StoragePoolInfo>({
      url: `/storage/pools/${encodeURIComponent(name)}/expand`,
      method: 'post',
      data: { disks },
    }),

  /** 池内磁盘 SMART 详情 */
  poolSmart: (name: string) =>
    request<DiskSmartDetail[]>(
      { url: `/storage/pools/${encodeURIComponent(name)}/smart` },
      () => demo.demoPoolSmart(name),
    ),

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
  list: () => request<ShareInfo[]>({ url: '/sharing' }, demo.demoShares),

  /** 创建共享 */
  create: (payload: CreateShareRequest) =>
    request<ShareInfo>({ url: '/sharing', method: 'post', data: payload }),

  /** 更新共享 */
  update: (name: string, payload: Partial<CreateShareRequest>) =>
    request<ShareInfo>({
      url: `/sharing/${encodeURIComponent(name)}`,
      method: 'put',
      data: payload,
    }),

  /** 删除共享 */
  remove: (name: string) =>
    request<{ removed: string }>({
      url: `/sharing/${encodeURIComponent(name)}`,
      method: 'delete',
    }),

  /** 共享状态（运行状态 + 连接详情） */
  status: (name: string) =>
    request<ShareStatusResponse>(
      { url: `/sharing/${encodeURIComponent(name)}/status` },
      () => demo.demoShareStatus(name),
    ),

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
  jobs: () => request<BackupJob[]>({ url: '/backup/jobs' }, demo.demoBackupJobs),

  /** 创建备份任务 */
  createJob: (payload: CreateBackupJobRequest) =>
    request<BackupJob>({ url: '/backup/jobs', method: 'post', data: payload }),

  /** 立即执行备份任务 */
  runJob: (id: string) =>
    request<BackupExecution>({
      url: `/backup/jobs/${encodeURIComponent(id)}/run`,
      method: 'post',
    }),

  /** 删除备份任务 */
  deleteJob: (id: string) =>
    request<{ deleted: string }>({
      url: `/backup/jobs/${encodeURIComponent(id)}`,
      method: 'delete',
    }),

  /** 备份执行历史 */
  history: (id: string) =>
    request<BackupExecution[]>(
      { url: `/backup/jobs/${encodeURIComponent(id)}/history` },
      () => demo.demoBackupHistory(id),
    ),

  /** 恢复备份 */
  restore: (id: string, executionId: string, targetPath?: string) =>
    request<{ restoring: boolean }>({
      url: `/backup/jobs/${encodeURIComponent(id)}/restore`,
      method: 'post',
      data: { executionId, targetPath },
    }),

  /** 快照列表 */
  snapshots: () => request<SnapshotInfo[]>({ url: '/backup/snapshots' }, demo.demoSnapshots),

  /** 创建快照 */
  createSnapshot: (pool: string, name: string) =>
    request<SnapshotInfo>({
      url: '/backup/snapshots',
      method: 'post',
      data: { pool, name },
    }),

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
  tasks: () => request<DownloadTask[]>({ url: '/download/tasks' }, demo.demoDownloadTasks),

  /** 新建下载任务（支持批量 URL） */
  addTask: (payload: AddDownloadRequest) =>
    request<DownloadTask[]>({ url: '/download/tasks', method: 'post', data: payload }),

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
  task: (gid: string) =>
    request<DownloadTask>({ url: `/download/tasks/${encodeURIComponent(gid)}` }),

  /** 下载设置 */
  settings: () =>
    request<Record<string, string>>({ url: '/download/settings' }, demo.demoDownloadSettings),

  /** 更新下载设置 */
  updateSettings: (payload: Record<string, string>) =>
    request<Record<string, string>>({
      url: '/download/settings',
      method: 'put',
      data: payload,
    }),
};

/* ---------- 网络配置 ---------- */

export const networkApi = {
  /** 网络接口列表 */
  interfaces: () =>
    request<NetInterface[]>({ url: '/network/interfaces' }, demo.demoNetInterfaces),

  /** 配置接口（DHCP/静态） */
  configureInterface: (name: string, payload: InterfaceConfigRequest) =>
    request<NetInterface>({
      url: `/network/interfaces/${encodeURIComponent(name)}`,
      method: 'put',
      data: payload,
    }),

  /** DNS 配置 */
  dns: () => request<DnsConfig>({ url: '/network/dns' }),

  /** 更新 DNS */
  setDns: (payload: DnsConfig) =>
    request<DnsConfig>({ url: '/network/dns', method: 'put', data: payload }),

  /** 防火墙规则列表 */
  firewall: () =>
    request<FirewallRule[]>({ url: '/network/firewall' }, demo.demoFirewallRules),

  /** 添加防火墙规则 */
  addFirewallRule: (payload: FirewallRuleRequest) =>
    request<FirewallRule>({ url: '/network/firewall', method: 'post', data: payload }),

  /** 删除防火墙规则 */
  removeFirewallRule: (id: string) =>
    request<{ removed: string }>({
      url: `/network/firewall/${encodeURIComponent(id)}`,
      method: 'delete',
    }),

  /** 监听端口列表 */
  ports: () =>
    request<ListeningPort[]>({ url: '/network/ports' }, demo.demoListeningPorts),

  /** WoL 设备列表 */
  wolDevices: () => request<WolDevice[]>({ url: '/network/wol' }, demo.demoWolDevices),

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
  list: (limit = 20, offset = 0, severity?: string) =>
    request<NotificationListResponse>(
      { url: '/notifications', params: { limit, offset, severity } },
      () => demo.demoNotifications(limit, offset),
    ),

  /** 标记单条已读 */
  markRead: (id: string) =>
    request<{ read: boolean }>({
      url: `/notifications/${encodeURIComponent(id)}/read`,
      method: 'post',
    }),

  /** 全部标记已读 */
  markAllRead: () =>
    request<{ read: number }>({ url: '/notifications/read-all', method: 'post' }),

  /** 删除通知 */
  remove: (id: string) =>
    request<{ removed: string }>({
      url: `/notifications/${encodeURIComponent(id)}`,
      method: 'delete',
    }),

  /** 通知设置 */
  settings: () =>
    request<NotificationSettings>(
      { url: '/notifications/settings' },
      demo.demoNotificationSettings,
    ),

  /** 更新通知设置 */
  updateSettings: (payload: NotificationSettings) =>
    request<NotificationSettings>({
      url: '/notifications/settings',
      method: 'put',
      data: payload,
    }),

  /** 未读计数 */
  unreadCount: () =>
    request<{ unread: number }>(
      { url: '/notifications/unread-count' },
      demo.demoUnreadCount,
    ),
};

/* ---------- 计划任务 ---------- */

export const schedulerApi = {
  /** 计划任务列表 */
  jobs: () => request<ScheduledJob[]>({ url: '/scheduler/jobs' }, demo.demoScheduledJobs),

  /** 创建计划任务 */
  createJob: (payload: CreateScheduledJobRequest) =>
    request<ScheduledJob>({ url: '/scheduler/jobs', method: 'post', data: payload }),

  /** 更新计划任务 */
  updateJob: (id: string, payload: Partial<CreateScheduledJobRequest>) =>
    request<ScheduledJob>({
      url: `/scheduler/jobs/${encodeURIComponent(id)}`,
      method: 'put',
      data: payload,
    }),

  /** 删除计划任务 */
  deleteJob: (id: string) =>
    request<{ deleted: string }>({
      url: `/scheduler/jobs/${encodeURIComponent(id)}`,
      method: 'delete',
    }),

  /** 立即执行计划任务 */
  runJob: (id: string) =>
    request<JobExecution>({
      url: `/scheduler/jobs/${encodeURIComponent(id)}/run`,
      method: 'post',
    }),

  /** 执行历史 */
  history: (id: string) =>
    request<JobExecution[]>(
      { url: `/scheduler/jobs/${encodeURIComponent(id)}/history` },
      () => demo.demoJobHistory(id),
    ),
};
