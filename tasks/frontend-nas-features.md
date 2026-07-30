# Vibe OS 前端开发任务书 — NAS 核心功能视图

> 你是 Vibe OS 项目的前端开发 Agent。本文件是你的完整任务指令，读取后按顺序开发以下视图。
> 开发前必须先阅读根目录 `AGENTS.md` 和以下现有文件以理解架构：
> - `web/src/views/DesktopView.vue`（WebOS 桌面主视图 + 窗口注册）
> - `web/src/stores/wm.ts`（窗口管理器 store）
> - `web/src/stores/system.ts`（系统数据 store + 5s 轮询）
> - `web/src/api/client.ts`（Axios 封装 + 演示模式降级）
> - `web/src/api/types.ts`（API 类型定义）
> - `web/src/components/desktop/AppWindow.vue`（窗口壳组件）
> - `web/src/styles/main.css`（全局 CSS 变量 --nx-*）

---

## 技术上下文

- 框架：Vue 3 (Composition API `<script setup>`) + TypeScript strict
- UI 库：Element Plus（深色主题已配置）
- 状态：Pinia
- 构建：Vite 7
- 架构：**WebOS 桌面模式** — 不是传统路由多页面，而是单桌面 + 可拖拽窗口
- 窗口注册流程：
  1. 在 `wm.ts` 的 `APP_REGISTRY` 中注册 `{ id, title, icon, defaultSize }`
  2. 在 `DesktopView.vue` 的 `<template>` 中添加 `<DesktopIcon>` + `<AppWindow>` 条件渲染
  3. 创建对应的 `XxxView.vue` 视图组件
- API 调用：统一走 `web/src/api/index.ts` 导出的函数，支持 `VITE_DEMO_MODE` 降级
- 样式：使用 `--nx-*` CSS 变量，深色主题，等宽字体类 `.nx-mono`，面板类 `.nx-panel`

### 组件目录结构

```
web/src/
├── views/
│   ├── FilesView.vue          # 文件管理器
│   ├── StorageView.vue        # 存储池管理
│   ├── SharingView.vue        # 共享文件夹
│   ├── BackupView.vue         # 备份与快照
│   ├── DownloadView.vue       # 下载中心
│   ├── NetworkView.vue        # 网络配置
│   └── SchedulerView.vue      # 计划任务
├── components/
│   ├── files/                 # 文件管理器子组件
│   ├── storage/               # 存储池子组件
│   ├── sharing/               # 共享子组件
│   ├── backup/                # 备份子组件
│   ├── download/              # 下载子组件
│   ├── network/               # 网络子组件
│   └── scheduler/             # 计划任务子组件
├── stores/
│   ├── files.ts
│   ├── storage.ts
│   ├── sharing.ts
│   ├── backup.ts
│   ├── download.ts
│   ├── network.ts
│   ├── notification.ts        # 通知 store（集成到任务栏）
│   └── scheduler.ts
└── api/
    └── types.ts               # 追加新模块类型（镜像后端 types）
```

---

## 视图 1：文件管理器 — `FilesView.vue`（P0）

### 功能

完整的文件浏览、上传、下载、编辑、回收站管理。

### UI 布局

```
┌─────────────────────────────────────────────────────┐
│ 工具栏：[← 上级] [路径面包屑] [刷新] [新建文件夹] [上传] │
├─────────────────────────────────────────────────────┤
│ 文件列表（表格模式）                                   │
│  图标 │ 名称 │ 大小 │ 修改时间 │ 操作(下载/重命名/删除)  │
│  📁   │ docs │  —   │ 07-25   │ ⋯                    │
│  📄   │ a.txt│ 2KB  │ 07-26   │ ⋯                    │
│  ...  │      │      │         │                      │
├─────────────────────────────────────────────────────┤
│ 状态栏：N 个项目 │ 已用 X / 配额 Y │ 回收站(N)         │
└─────────────────────────────────────────────────────┘
```

### 交互要求

- 双击文件夹进入，双击文本文件打开编辑器（el-drawer 侧滑 + `<textarea>` 或 CodeMirror）
- 右键菜单：下载 / 重命名 / 复制 / 移动到 / 删除（到回收站）
- 拖拽上传（el-upload drag 模式），支持多文件
- 面包屑路径导航，可点击任意层级跳转
- 回收站：底部状态栏点击打开 el-drawer，列出已删除文件，支持恢复 / 永久删除 / 清空
- 列表支持按名称/大小/时间排序（点击表头）
- 大目录分页（前端虚拟滚动或后端分页）

### Store: `stores/files.ts`

```typescript
// state
currentPath: string        // 当前相对路径
entries: FileEntry[]       // 当前目录内容
selected: string[]         // 选中项
trashItems: FileEntry[]    // 回收站
loading: boolean
sortKey: 'name' | 'size' | 'modifiedAt'
sortAsc: boolean

// actions
fetchList(path?: string)
mkdir(name: string)
rename(path: string, newName: string)
remove(path: string, permanent?: boolean)
copy(src: string, dest: string)
upload(files: File[], targetDir: string)
fetchTrash()
restoreFromTrash(path: string)
emptyTrash()
```

---

## 视图 2：存储池管理 — `StorageView.vue`（P0）

### 功能

物理磁盘总览、RAID 阵列创建/管理、池状态监控。

### UI 布局

```
┌─────────────────────────────────────────────────────┐
│ 物理磁盘（横向卡片）                                  │
│  [sda 2TB ✓] [sdb 2TB ✓] [sdc 4TB ⚠] [sdd 未使用]  │
├─────────────────────────────────────────────────────┤
│ 存储池列表                                           │
│  ┌─ data-pool ─────────────────────────────────┐    │
│  │ RAID5 · 3盘 · 8TB/12TB (67%) · active      │    │
│  │ [扩容] [校验] [SMART详情] [销毁]             │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─ backup-pool ───────────────────────────────┐    │
│  │ RAID1 · 2盘 · 1.2TB/2TB (60%) · active     │    │
│  └─────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────┤
│ [+ 创建存储池]                                       │
└─────────────────────────────────────────────────────┘
```

### 交互要求

- 磁盘卡片：显示型号、容量、温度、SMART 状态色（绿/黄/红）
- 创建池：el-dialog 向导 → 选磁盘（checkbox）→ 选 RAID 级别 → 确认（二次密码/token 确认）
- 池状态：进度条 + 状态徽章（active/degraded/rebuilding）
- Scrub：点击后显示进度条（轮询 scrub/status）
- 销毁：红色按钮 + el-popconfirm 二次确认 + 输入池名确认
- 扩容：选择未使用磁盘 → 确认

### Store: `stores/storage.ts`

```typescript
disks: PhysicalDisk[]
pools: StoragePoolInfo[]
scrubStatus: Record<string, { running: boolean; progress: number }>
loading: boolean

fetchDisks()
fetchPools()
createPool(payload)
destroyPool(name, confirmToken)
expandPool(name, disks)
startScrub(name)
pollScrubStatus(name)
```

---

## 视图 3：共享文件夹 — `SharingView.vue`（P0）

### 功能

SMB/NFS/WebDAV 共享的创建、编辑、状态监控。

### UI 布局

```
┌─────────────────────────────────────────────────────┐
│ 共享列表（表格）                                      │
│  名称 │ 路径 │ 协议 │ 权限 │ 连接数 │ 状态 │ 操作     │
│  docs │ /data/1000/files/docs │ SMB │ 读写 │ 3 │ ● │  │
│  media│ /data/1000/files/media│ NFS │ 只读 │ 0 │ ● │  │
├─────────────────────────────────────────────────────┤
│ [+ 新建共享]                                         │
└─────────────────────────────────────────────────────┘
```

### 交互要求

- 新建/编辑：el-dialog 表单（名称、路径选择器、协议 radio、权限 switch、用户多选、主机白名单）
- 协议标签用不同颜色区分：SMB=蓝、NFS=绿、WebDAV=紫
- 状态列：绿色圆点=服务运行中、红色=停止
- 点击连接数展开 popover 显示当前连接详情（用户、IP、打开文件数）
- 操作列：编辑 / 重启服务 / 删除（el-popconfirm）

### Store: `stores/sharing.ts`

```typescript
shares: ShareInfo[]
connections: Record<string, ShareConnection[]>
loading: boolean

fetchShares()
createShare(payload)
updateShare(name, payload)
removeShare(name)
fetchConnections(name)
restartService(name)
```

---

## 视图 4：备份与快照 — `BackupView.vue`（P1）

### 功能

备份任务管理、手动/定时执行、恢复、快照管理。

### UI 布局（el-tabs 两标签）

**标签 1：备份任务**
```
┌─────────────────────────────────────────────────────┐
│ 任务卡片列表                                         │
│  ┌─ 每日文档备份 ──────────────────────────────┐     │
│  │ rsync · /data/1000/files → /data/backup    │     │
│  │ 每天 03:00 · 上次: 成功(07-27) · [运行][历史]│     │
│  └────────────────────────────────────────────┘     │
│ [+ 新建备份任务]                                     │
├─────────────────────────────────────────────────────┤
│ 执行历史（el-timeline）                              │
│  ● 07-27 03:00 成功 · 1.2GB · 342 文件              │
│  ● 07-26 03:00 成功 · 800MB · 128 文件              │
│  ○ 07-25 03:00 失败 · 目标不可达                     │
└─────────────────────────────────────────────────────┘
```

**标签 2：快照**
```
┌─────────────────────────────────────────────────────┐
│ 快照列表（表格）                                      │
│  名称 │ 池 │ 创建时间 │ 占用 │ 操作(恢复/删除)        │
│  snap-0727 │ data-pool │ 07-27 03:00 │ 2.1GB │ ...  │
├─────────────────────────────────────────────────────┤
│ [+ 创建快照]                                         │
└─────────────────────────────────────────────────────┘
```

### 交互要求

- 新建任务：el-dialog（名称、源路径、目标路径、类型 radio、cron 表达式 + 人类可读预览）
- 执行中任务：显示进度条 + 传输速率（轮询）
- 恢复：选择历史执行 → 确认 → 显示恢复进度
- 快照创建：选池 + 输入名称 → 确认

### Store: `stores/backup.ts`

```typescript
jobs: BackupJob[]
executions: Record<string, BackupExecution[]>
snapshots: SnapshotInfo[]
loading: boolean

fetchJobs()
createJob(payload)
runJob(id)
deleteJob(id)
fetchHistory(jobId)
restore(jobId, executionId)
fetchSnapshots(pool?)
createSnapshot(pool, name)
deleteSnapshot(name)
```

---

## 视图 5：下载中心 — `DownloadView.vue`（P1）

### 功能

下载任务管理（HTTP/BT/磁力），实时进度，全局限速。

### UI 布局

```
┌─────────────────────────────────────────────────────┐
│ 工具栏：[+ 新建下载] [全部暂停] [全部开始] │ 限速: [__] │
├─────────────────────────────────────────────────────┤
│ 下载列表                                             │
│  ┌─ ubuntu-24.04.iso ─────────────────────────┐     │
│  │ ████████████░░░░ 78% · 12.3 MB/s · ETA 2m  │     │
│  │ 3.2GB / 4.1GB · 16 连接                    │     │
│  │ [暂停] [删除]                               │     │
│  └────────────────────────────────────────────┘     │
│  ┌─ debian-13.iso ────────────────────────────┐     │
│  │ ████████████████ 100% · 完成               │     │
│  │ [打开目录] [删除记录]                        │     │
│  └────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────┤
│ 状态栏：活动 2 │ 等待 1 │ 已完成 15 │ 总速度 24.6MB/s │
└─────────────────────────────────────────────────────┘
```

### 交互要求

- 新建下载：el-dialog（URL 输入，支持多行批量、磁力链接自动识别）
- 进度条：el-progress 带速率标注，active 任务 2s 轮询刷新
- BT 任务：展开显示文件列表 + 各文件进度
- 全局设置：el-drawer（最大并发、限速、默认目录、BT 端口）
- 已完成任务：灰色样式，操作仅保留"删除记录"
- 错误任务：红色标注 + 错误信息 tooltip

### Store: `stores/download.ts`

```typescript
tasks: DownloadTask[]
settings: Record<string, string>
loading: boolean
pollTimer: number | null

fetchTasks()
addTask(urls: string[], dir?: string)
removeTask(gid: string)
pauseTask(gid: string)
resumeTask(gid: string)
fetchSettings()
updateSettings(payload)
startPolling()   // 2s 间隔，仅在有 active 任务时
stopPolling()
```

---

## 视图 6：网络配置 — `NetworkView.vue`（P1）

### 功能

网络接口管理、DNS 配置、防火墙规则、端口监控、WoL。

### UI 布局（el-tabs 四标签）

**标签 1：接口**
- 接口卡片列表（名称、类型图标、IP、MAC、状态灯、速率）
- 编辑：el-dialog（DHCP/Static 切换、IP/掩码/网关输入）

**标签 2：防火墙**
- 规则表格（链、协议、端口、动作、来源、备注）
- 添加规则：行内表单或 el-dialog
- 默认策略：顶部三个 select（Input/Forward/Output = accept/drop）

**标签 3：端口**
- 监听端口表格（协议、地址:端口、进程名、PID）
- 搜索过滤框

**标签 4：WoL**
- 已保存设备列表（名称、MAC、上次唤醒时间）
- 唤醒按钮 + 添加设备表单

### Store: `stores/network.ts`

```typescript
interfaces: NetInterface[]
dns: { servers: string[]; search: string[] }
firewallRules: FirewallRule[]
listeningPorts: ListeningPort[]
wolDevices: Array<{ name: string; mac: string; lastWake: string | null }>

fetchInterfaces()
updateInterface(name, payload)
fetchDns() / updateDns(payload)
fetchFirewall() / addRule(payload) / removeRule(id)
fetchPorts()
fetchWolDevices() / sendWol(mac)
```

---

## 视图 7：通知中心 — 集成到任务栏（P2）

### 功能

不是独立窗口，而是任务栏右侧的铃铛图标 + 下拉面板。

### UI 设计

- 任务栏（`DesktopTaskbar.vue`）右侧添加铃铛图标 + 未读数红色角标
- 点击展开 el-popover 通知面板：
  - 顶部：全部已读 / 设置（齿轮图标）
  - 列表：severity 色条（info=蓝、warning=黄、critical=红）+ 标题 + 时间
  - 底部：加载更多
- 设置 popover：webhook URL 输入、最低告警级别 select、静默时段

### Store: `stores/notification.ts`

```typescript
notifications: Notification[]
unreadCount: number
loading: boolean

fetchUnreadCount()     // 集成到 system.fetchAll() 的 5s 轮询
fetchNotifications(limit, offset, severity?)
markRead(id)
markAllRead()
remove(id)
fetchSettings() / updateSettings(payload)
```

### 集成点

- 修改 `DesktopTaskbar.vue`：添加铃铛 + 角标 + popover
- 修改 `stores/system.ts` 的 `fetchAll()`：追加 `notification.fetchUnreadCount()`
- critical 告警仍走现有 `activeAlerts` 弹窗机制，notification store 负责历史持久化

---

## 视图 8：计划任务 — `SchedulerView.vue`（P2）

### 功能

Cron 任务可视化管理、执行历史。

### UI 布局

```
┌─────────────────────────────────────────────────────┐
│ 任务列表（表格）                                      │
│  名称 │ 命令 │ 计划 │ 状态 │ 上次执行 │ 操作          │
│  日志清理 │ /data/vibeos/scripts/clean.sh │ 0 3 * * * │ ● │ ... │
├─────────────────────────────────────────────────────┤
│ [+ 新建任务]                                         │
└─────────────────────────────────────────────────────┘

执行历史（el-drawer 侧滑）：
  el-timeline 显示每次执行的退出码、耗时、stdout/stderr 折叠
```

### 交互要求

- 新建/编辑：el-dialog（名称、命令 textarea、cron 输入 + 人类可读预览如"每天 03:00"）
- cron 预览：实时解析 cron 表达式显示下次 5 次执行时间
- 启用/禁用：el-switch 行内切换
- 立即执行：按钮 → 状态变 running → 完成后刷新
- 历史：点击行展开 el-drawer，timeline 展示，stdout/stderr 用 `<pre>` 等宽显示

### Store: `stores/scheduler.ts`

```typescript
jobs: ScheduledJob[]
executions: Record<string, JobExecution[]>
loading: boolean

fetchJobs()
createJob(payload)
updateJob(id, payload)
deleteJob(id)
runJob(id)
fetchHistory(jobId)
```

---

## 桌面注册（所有视图完成后）

### 1. `wm.ts` APP_REGISTRY 追加

```typescript
{ id: 'files',     title: '文件管理',   icon: 'FolderOpened', defaultSize: { w: 900, h: 600 } },
{ id: 'storage',   title: '存储池',     icon: 'Coin',         defaultSize: { w: 860, h: 580 } },
{ id: 'sharing',   title: '共享文件夹', icon: 'Share',        defaultSize: { w: 800, h: 520 } },
{ id: 'backup',    title: '备份中心',   icon: 'FolderChecked',defaultSize: { w: 820, h: 560 } },
{ id: 'download',  title: '下载中心',   icon: 'Download',     defaultSize: { w: 780, h: 560 } },
{ id: 'network',   title: '网络配置',   icon: 'Connection',   defaultSize: { w: 840, h: 560 } },
{ id: 'scheduler', title: '计划任务',   icon: 'Timer',        defaultSize: { w: 800, h: 520 } },
```

### 2. `DesktopView.vue` 追加

- 桌面图标区：追加 7 个 `<DesktopIcon>`（图标从 @element-plus/icons-vue 导入）
- 窗口层：追加 7 个 `<XxxView v-else-if="win.id === 'xxx'" />`
- 桌面图标过多时考虑分页或文件夹分组（图标区可滚动）

---

## API 层追加

在 `web/src/api/index.ts` 中为每个模块添加对应的 API 函数，遵循现有模式：

```typescript
// 示例
export const filesApi = {
  list: (uid: number, path = '') => client.get('/files/list', { params: { uid, path } }),
  mkdir: (uid: number, path: string) => client.post('/files/mkdir', { uid, path }),
  // ...
};
```

在 `web/src/api/types.ts` 中追加所有新模块的类型定义（与后端 `*.types.ts` 镜像）。

在 `web/src/api/demo-data.ts` 中为每个模块提供演示降级数据（VITE_DEMO_MODE=true 时使用）。

---

## 样式规范

- 所有新组件使用 `<style scoped>`
- 颜色/间距/圆角统一用 `--nx-*` CSS 变量（参考 `main.css`）
- 表格用 el-table + 深色主题适配
- 卡片用 `.nx-panel` 类
- 等宽数据（路径、IP、命令）用 `.nx-mono`
- 状态色：成功=var(--el-color-success)、警告=warning、危险=danger、信息=info
- 动画：视图进入用 `animation: fade-up 0.3s ease both`（现有模式）
- 响应式：窗口最小宽度 640px，内部布局在窄窗口时降级为单列

---

## 开发顺序

P0（文件管理器 → 存储池 → 共享文件夹）→ P1（备份 → 下载 → 网络）→ P2（通知 → 计划任务）

每完成一个视图：
1. `pnpm web:lint` → 修复
2. `pnpm web:build` → 修复（vue-tsc 类型检查）
3. `pnpm web:test` → 修复
4. 提交：`feat(web): 实现 {视图名} 视图`

全部完成后：
1. 注册所有桌面图标 + 窗口
2. 全量 `pnpm web:lint && pnpm web:build && pnpm web:test`
3. 确保演示模式下所有视图可正常渲染（不依赖后端）
