# Vibe OS 后端开发任务书 — NAS 核心功能模块

> 你是 Vibe OS 项目的后端开发 Agent。本文件是你的完整任务指令，读取后按顺序开发以下 8 个模块。
> 开发前必须先阅读根目录 `AGENTS.md`（安全红线、代码规范、迭代循环）和 `src/config.ts`（全局配置）。

---

## 项目技术上下文

- 运行时：Node.js ≥ 22, TypeScript strict, ESM (`"type": "module"`)
- 框架：Express 5 + Zod 校验
- 测试：Vitest + Supertest
- 数据根：`VIBEOS_DATA_ROOT`（默认 `/data`），见 `src/config.ts`
- 已有模块参考：`src/modules/container/`（最完整的模块，含 deploy/list/restart/stop/remove/logs）
- 公共工具：`src/common/` 下的 `async-handler.ts`、`validate.ts`、`app-error.ts`、`error-handler.ts`、`auth-middleware.ts`
- 路由注册：在 `src/app.ts` 中 `app.use('/api', moduleRoutes)` 模式

### 模块目录结构（强制）

```
src/modules/{module}/
├── {module}.controller.ts    # 请求处理，调用 service
├── {module}.service.ts       # 业务逻辑，调用系统命令
├── {module}.routes.ts        # Express Router + Zod schema
├── {module}.types.ts         # 接口/类型定义
├── __tests__/
│   └── {module}.test.ts      # Vitest + Supertest 测试
└── index.ts                  # 导出 routes
```

### 系统命令调用规范

- 所有 shell 命令必须封装在 service 层，通过 `child_process.execFile`（禁止 `exec`）
- 命令参数用数组传递，禁止字符串拼接
- 超时使用 `config.COMMAND_TIMEOUT_MS`
- 路径参数必须 `path.resolve()` + 前缀校验（确保在 `/data/` 内）

---

## 模块 1：文件管理器（P0）

### 功能需求

提供对 `/data/{uid}/` 用户空间的完整文件 CRUD 操作。

### API 设计

```
GET    /api/files/list?path={relativePath}&uid={uid}
       → 列出目录内容（名称、类型、大小、修改时间、权限）
       → path 相对于 /data/{uid}/，默认 ""（根目录）
       → 返回 { entries: FileEntry[], path: string, total: number }

GET    /api/files/read?path={relativePath}&uid={uid}
       → 读取文本文件内容（限制 1MB，超过返回截断 + 标记）
       → 返回 { content: string, size: number, truncated: boolean, mimeType: string }

POST   /api/files/mkdir
       → body: { path: string, uid: number }
       → 创建目录（递归），返回 { created: string }

POST   /api/files/write
       → body: { path: string, uid: number, content: string }
       → 写入/覆盖文本文件，返回 { written: string, size: number }

POST   /api/files/rename
       → body: { path: string, newName: string, uid: number }
       → 重命名/移动，返回 { from: string, to: string }

DELETE /api/files/delete
       → body: { path: string, uid: number, permanent?: boolean }
       → permanent=false（默认）：移动到 /data/{uid}/.trash/
       → permanent=true：真正删除
       → 返回 { deleted: string, method: 'trash' | 'permanent' }

POST   /api/files/copy
       → body: { src: string, dest: string, uid: number }
       → 复制文件/目录，返回 { copied: string, dest: string }

GET    /api/files/download?path={relativePath}&uid={uid}
       → 流式下载文件（Content-Disposition: attachment）

POST   /api/files/upload
       → multipart/form-data: file + path（目标目录）+ uid
       → 返回 { uploaded: string, size: number }

GET    /api/files/trash?uid={uid}
       → 列出回收站内容

DELETE /api/files/trash/empty?uid={uid}
       → 清空回收站
```

### 安全约束

- 所有 path 参数必须 normalize 后校验前缀为 `/data/{uid}/`，拒绝 `..` 穿越
- 禁止访问 `/data/vibeos/`（系统目录）和其他用户目录
- 上传文件大小限制：单文件 10GB（流式写入，不全量加载内存）
- 回收站路径：`/data/{uid}/.trash/`，保留原始相对路径结构

### 类型定义

```typescript
interface FileEntry {
  name: string;
  path: string;          // 相对于用户根的路径
  type: 'file' | 'directory' | 'symlink';
  size: number;          // 字节，目录为 0
  modifiedAt: string;    // ISO 8601
  permissions: string;   // 如 "rwxr-xr-x"
  mimeType?: string;     // 仅文件
}
```

---

## 模块 2：存储池管理（P0）

### 功能需求

管理物理磁盘的分组、RAID 阵列创建与状态监控、存储池扩展。

### API 设计

```
GET    /api/storage/disks
       → 列出所有物理磁盘（lsblk -J）
       → 返回 { disks: PhysicalDisk[] }

GET    /api/storage/pools
       → 列出所有存储池（mdadm --detail --scan + zpool list 或自定义配置）
       → 返回 { pools: StoragePoolInfo[] }

POST   /api/storage/pools
       → body: { name: string, level: 'raid0'|'raid1'|'raid5'|'raid6'|'raid10'|'jbod', disks: string[] }
       → 创建 RAID 阵列 + mkfs + 挂载到 /data/pools/{name}
       → 返回 { pool: StoragePoolInfo }

DELETE /api/storage/pools/:name
       → 卸载 + 停止阵列（需二次确认 token）
       → 返回 { destroyed: string }

POST   /api/storage/pools/:name/expand
       → body: { disks: string[] }
       → 向现有阵列添加磁盘
       → 返回 { pool: StoragePoolInfo }

GET    /api/storage/pools/:name/smart
       → 池内所有磁盘的 SMART 详情
       → 返回 { disks: DiskSmartDetail[] }

POST   /api/storage/pools/:name/scrub
       → 启动数据校验（scrub）
       → 返回 { started: boolean, estimatedHours?: number }

GET    /api/storage/pools/:name/scrub/status
       → 校验进度
       → 返回 { running: boolean, progress?: number, errors?: number }
```

### 类型定义

```typescript
interface PhysicalDisk {
  device: string;        // /dev/sda
  model: string;
  serial: string;
  sizeBytes: number;
  fsType: string | null;
  mountPoint: string | null;
  inPool: string | null; // 所属池名
  smart: { healthy: boolean; temperature: number | null; powerOnHours: number | null };
}

interface StoragePoolInfo {
  name: string;
  level: string;
  devices: string[];
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
  mountPoint: string;
  state: 'active' | 'degraded' | 'rebuilding' | 'inactive';
  syncProgress?: number;  // 重建进度 0-100
}
```

### 安全约束

- 创建/销毁池的操作必须记录审计日志到 `/data/vibeos/logs/storage-audit.log`
- 销毁操作需要请求体携带 `confirmToken`（由 GET 接口预生成）
- 禁止对系统盘（挂载 `/` 的设备）执行任何写操作

---

## 模块 3：共享文件夹（P0）

### 功能需求

管理 SMB/CIFS、NFS、WebDAV 共享的创建、权限、状态。

### API 设计

```
GET    /api/sharing
       → 列出所有共享（解析 /etc/samba/smb.conf + /etc/exports + 自定义 webdav 配置）
       → 返回 { shares: ShareInfo[] }

POST   /api/sharing
       → body: { name, path, protocol: 'smb'|'nfs'|'webdav', readonly, validUsers?, hosts? }
       → 创建共享配置 + 重启对应服务
       → 返回 { share: ShareInfo }

PUT    /api/sharing/:name
       → 修改共享配置（权限、路径、用户）
       → 返回 { share: ShareInfo }

DELETE /api/sharing/:name
       → 移除共享配置 + 重启服务
       → 返回 { removed: string }

GET    /api/sharing/:name/status
       → 连接状态（smbstatus / showmount -e）
       → 返回 { activeConnections: ShareConnection[] }

POST   /api/sharing/:name/restart
       → 重启对应协议服务
       → 返回 { restarted: string, pid: number }
```

### 类型定义

```typescript
interface ShareInfo {
  name: string;
  path: string;           // 共享的实际路径（必须在 /data/ 下）
  protocol: 'smb' | 'nfs' | 'webdav';
  readonly: boolean;
  validUsers: string[];   // 空 = 所有用户
  hosts: string[];        // 允许的主机，空 = 所有
  enabled: boolean;
  port?: number;          // webdav 端口
}

interface ShareConnection {
  user: string;
  host: string;
  openedAt: string;
  files: number;
}
```

### 实现说明

- SMB：生成/修改 `/etc/samba/smb.conf` 的 share section，调用 `smbcontrol smbd reload-config`
- NFS：修改 `/etc/exports`，调用 `exportfs -ra`
- WebDAV：使用内置 Express 子路由 + `webdav-server` 或 rclone serve，监听独立端口
- 共享路径必须在 `/data/` 下，禁止共享系统目录

---

## 模块 4：备份与快照（P1）

### 功能需求

定时/手动备份用户数据到指定目标，支持文件系统快照（btrfs/zfs）和 rsync 增量备份。

### API 设计

```
GET    /api/backup/jobs
       → 列出所有备份任务
       → 返回 { jobs: BackupJob[] }

POST   /api/backup/jobs
       → body: { name, source, target, schedule?: cron表达式, type: 'rsync'|'snapshot'|'archive' }
       → 创建备份任务
       → 返回 { job: BackupJob }

POST   /api/backup/jobs/:id/run
       → 立即执行一次备份
       → 返回 { execution: BackupExecution }

DELETE /api/backup/jobs/:id
       → 删除备份任务
       → 返回 { removed: string }

GET    /api/backup/jobs/:id/history
       → 执行历史
       → 返回 { executions: BackupExecution[] }

POST   /api/backup/jobs/:id/restore
       → body: { executionId: string, targetPath?: string }
       → 从备份恢复
       → 返回 { restoreId: string, status: 'started' }

GET    /api/backup/snapshots?pool={poolName}
       → 列出文件系统快照
       → 返回 { snapshots: SnapshotInfo[] }

POST   /api/backup/snapshots
       → body: { pool: string, name: string }
       → 手动创建快照
       → 返回 { snapshot: SnapshotInfo }

DELETE /api/backup/snapshots/:name
       → 删除快照
       → 返回 { removed: string }
```

### 类型定义

```typescript
interface BackupJob {
  id: string;
  name: string;
  source: string;         // 源路径
  target: string;         // 目标路径（本地或远程 rsync://）
  type: 'rsync' | 'snapshot' | 'archive';
  schedule: string | null; // cron 表达式
  enabled: boolean;
  lastRun: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
}

interface BackupExecution {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'failed';
  filesTransferred: number;
  bytesTransferred: number;
  error?: string;
}

interface SnapshotInfo {
  name: string;
  pool: string;
  createdAt: string;
  usedBytes: number;
  referencedBytes: number;
}
```

### 实现说明

- 备份任务配置持久化到 `/data/vibeos/backup/jobs.json`
- 执行日志写入 `/data/vibeos/backup/logs/{jobId}/`
- rsync 调用：`execFile('rsync', ['-avz', '--delete', '--progress', src, dest])`
- 快照：检测文件系统类型，btrfs 用 `btrfs subvolume snapshot`，zfs 用 `zfs snapshot`
- 定时调度：使用 node-cron 或系统 crontab（写入 `/data/vibeos/backup/crontab`）

---

## 模块 5：下载中心（P1）

### 功能需求

管理 HTTP/BT/磁力链接下载任务，基于 aria2 后端。

### API 设计

```
GET    /api/download/tasks
       → 列出所有下载任务（aria2 JSON-RPC: aria2.tellActive + tellWaiting + tellStopped）
       → 返回 { tasks: DownloadTask[] }

POST   /api/download/tasks
       → body: { urls: string[], targetDir?: string, headers?: Record<string,string> }
       → 添加下载任务（aria2.addUri）
       → 返回 { gids: string[] }

DELETE /api/download/tasks/:gid
       → 删除/停止任务（aria2.remove / aria2.removeDownloadResult）
       → 返回 { removed: string }

POST   /api/download/tasks/:gid/pause
       → 暂停任务
       → 返回 { paused: string }

POST   /api/download/tasks/:gid/resume
       → 恢复任务
       → 返回 { resumed: string }

GET    /api/download/tasks/:gid
       → 单任务详情（含分片进度）
       → 返回 { task: DownloadTask }

GET    /api/download/settings
       → aria2 全局设置
       → 返回 { settings: Record<string, string> }

PUT    /api/download/settings
       → 修改全局设置（限速、并发数等）
       → 返回 { updated: string[] }
```

### 类型定义

```typescript
interface DownloadTask {
  gid: string;
  name: string;
  status: 'active' | 'waiting' | 'paused' | 'complete' | 'error' | 'removed';
  totalBytes: number;
  completedBytes: number;
  progress: number;       // 0-100
  downloadSpeed: number;  // bytes/s
  uploadSpeed: number;
  connections: number;
  eta: number | null;     // 秒
  dir: string;
  files: Array<{ path: string; length: number; completedLength: number }>;
  error?: string;
  startedAt: string;
  completedAt: string | null;
}
```

### 实现说明

- 通过 aria2 JSON-RPC（HTTP `http://127.0.0.1:6800/jsonrpc`）通信，不直接管理进程
- 默认下载目录：`/data/{uid}/files/downloads/`
- aria2 配置文件：`/data/vibeos/aria2/aria2.conf`
- 若 aria2 未运行，API 返回 `{ success: false, error: { code: 'ARIA2_NOT_RUNNING', ... } }`
- 磁力链接/BT 种子：aria2 原生支持，无需额外处理

---

## 模块 6：网络配置（P1）

### 功能需求

管理网络接口、DNS、防火墙规则、端口转发。

### API 设计

```
GET    /api/network/interfaces
       → 列出所有网络接口（ip -j addr）
       → 返回 { interfaces: NetInterface[] }

PUT    /api/network/interfaces/:name
       → body: { method: 'dhcp'|'static', ip?, netmask?, gateway?, dns? }
       → 配置接口（写入 /etc/network/interfaces 或 netplan）
       → 返回 { interface: NetInterface }

GET    /api/network/dns
       → 当前 DNS 配置
       → 返回 { servers: string[], search: string[] }

PUT    /api/network/dns
       → body: { servers: string[], search?: string[] }
       → 修改 DNS
       → 返回 { updated: boolean }

GET    /api/network/firewall
       → 防火墙规则列表（nftables/iptables）
       → 返回 { rules: FirewallRule[], defaultPolicy: { input, forward, output } }

POST   /api/network/firewall
       → body: { chain, protocol, port, action, source?, comment? }
       → 添加规则
       → 返回 { rule: FirewallRule }

DELETE /api/network/firewall/:id
       → 删除规则
       → 返回 { removed: string }

GET    /api/network/ports
       → 当前监听端口（ss -tlnp）
       → 返回 { ports: ListeningPort[] }

GET    /api/network/wol
       → WoL 可用设备列表（从 /data/vibeos/network/wol-devices.json）

POST   /api/network/wol
       → body: { mac: string, broadcast?: string }
       → 发送 Wake-on-LAN 魔术包
       → 返回 { sent: boolean }
```

### 类型定义

```typescript
interface NetInterface {
  name: string;
  type: 'ethernet' | 'wifi' | 'bridge' | 'vlan' | 'loopback';
  state: 'up' | 'down';
  method: 'dhcp' | 'static' | 'manual';
  addresses: Array<{ family: 'inet' | 'inet6'; address: string; prefix: number }>;
  mac: string;
  speed: string | null;
  gateway: string | null;
}

interface FirewallRule {
  id: string;
  chain: 'input' | 'forward' | 'output';
  protocol: 'tcp' | 'udp' | 'icmp' | 'all';
  port: number | string | null;  // 支持范围 "8000:9000"
  action: 'accept' | 'drop' | 'reject';
  source: string | null;
  comment: string;
}

interface ListeningPort {
  protocol: string;
  localAddress: string;
  port: number;
  process: string | null;
  pid: number | null;
}
```

---

## 模块 7：通知与告警（P2）

### 功能需求

统一告警收集（磁盘、服务、备份失败等）+ 通知渠道（Web UI 内推送、Webhook）。

### API 设计

```
GET    /api/notifications?limit=50&offset=0&severity=
       → 告警/通知历史列表
       → 返回 { notifications: Notification[], total: number }

POST   /api/notifications/:id/read
       → 标记已读
       → 返回 { updated: string }

POST   /api/notifications/read-all
       → 全部已读
       → 返回 { updated: number }

DELETE /api/notifications/:id
       → 删除通知
       → 返回 { removed: string }

GET    /api/notifications/settings
       → 通知渠道配置
       → 返回 { channels: NotificationChannel[] }

PUT    /api/notifications/settings
       → 修改通知配置（webhook URL、告警级别阈值、静默时段）
       → 返回 { updated: boolean }

GET    /api/notifications/unread-count
       → 未读数量（供任务栏角标）
       → 返回 { count: number }
```

### 类型定义

```typescript
interface Notification {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'disk' | 'service' | 'backup' | 'network' | 'security' | 'system';
  title: string;
  detail: string;
  source: string;         // 产生告警的模块名
  read: boolean;
  createdAt: string;
}

interface NotificationChannel {
  type: 'webhook' | 'email';
  enabled: boolean;
  url?: string;           // webhook
  minSeverity: 'info' | 'warning' | 'critical';
}
```

### 实现说明

- 通知持久化：SQLite 数据库 `/data/vibeos/notification/notifications.db`（使用 better-sqlite3）
- 各模块通过 `NotificationService.emit(severity, category, title, detail)` 发布告警
- 前端通过 `GET /api/notifications/unread-count` 轮询（复用现有 5s 轮询）
- Webhook 推送：POST JSON 到配置的 URL，失败重试 3 次

---

## 模块 8：计划任务（P2）

### 功能需求

可视化管理 cron 任务，支持自定义脚本执行。

### API 设计

```
GET    /api/scheduler/jobs
       → 列出所有计划任务
       → 返回 { jobs: ScheduledJob[] }

POST   /api/scheduler/jobs
       → body: { name, command, schedule: cron表达式, enabled }
       → 创建计划任务
       → 返回 { job: ScheduledJob }

PUT    /api/scheduler/jobs/:id
       → 修改任务
       → 返回 { job: ScheduledJob }

DELETE /api/scheduler/jobs/:id
       → 删除任务
       → 返回 { removed: string }

POST   /api/scheduler/jobs/:id/run
       → 立即执行一次
       → 返回 { execution: JobExecution }

GET    /api/scheduler/jobs/:id/history?limit=20
       → 执行历史
       → 返回 { executions: JobExecution[] }
```

### 类型定义

```typescript
interface ScheduledJob {
  id: string;
  name: string;
  command: string;
  schedule: string;       // cron 表达式
  enabled: boolean;
  lastRun: string | null;
  lastStatus: 'success' | 'failed' | 'running' | null;
  nextRun: string | null;
}

interface JobExecution {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  stdout: string;         // 截断到 10KB
  stderr: string;
  status: 'running' | 'success' | 'failed';
}
```

### 实现说明

- 任务配置持久化：`/data/vibeos/scheduler/jobs.json`
- 执行日志：`/data/vibeos/scheduler/logs/{jobId}/`
- 调度引擎：node-cron（进程内），不依赖系统 crontab
- 命令执行：`execFile('/bin/bash', ['-c', command])`，超时 300s
- 禁止执行 `rm -rf /`、`mkfs`、`dd` 等破坏性命令（正则黑名单校验）

---

## 路由注册

在 `src/app.ts` 中按现有模式注册所有新模块路由：

```typescript
import filemanagerRoutes from './modules/filemanager/index.js';
import storageRoutes from './modules/storage/index.js';
import sharingRoutes from './modules/sharing/index.js';
import backupRoutes from './modules/backup/index.js';
import downloadRoutes from './modules/download/index.js';
import networkRoutes from './modules/network/index.js';
import notificationRoutes from './modules/notification/index.js';
import schedulerRoutes from './modules/scheduler/index.js';

app.use('/api', filemanagerRoutes);
app.use('/api', storageRoutes);
// ... 以此类推
```

---

## 测试要求

每个模块至少覆盖：
1. 正常路径（CRUD 各操作）
2. 路径穿越攻击（`../../etc/passwd`）→ 必须 403
3. 参数校验失败 → 400 + 明确错误信息
4. 资源不存在 → 404
5. 权限越界（访问其他用户目录）→ 403

测试中系统命令使用 `vi.mock('child_process')` 模拟，不依赖真实系统环境。

---

## 开发顺序

按优先级顺序开发：P0（文件管理器 → 存储池 → 共享文件夹）→ P1（备份 → 下载 → 网络）→ P2（通知 → 计划任务）。

每完成一个模块：
1. `pnpm lint` → 修复
2. `pnpm build` → 修复
3. `pnpm test` → 修复
4. 提交：`feat: 实现 {模块名} 模块`

全部完成后执行一次全量 `pnpm lint && pnpm build && pnpm test`，确保零错误。
