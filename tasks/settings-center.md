# NAISys 系统设置中心 — 完整开发任务书

> 你是 NAISys 项目的开发 Agent。本任务将现有简陋的"系统设置"窗口重构为功能健全的 NAS 系统设置中心。
> 本任务涵盖**后端 API + 前端视图**，由你一人完成。
>
> 开发前必读：
> - 根目录 `AGENTS.md`（安全红线、代码规范、迭代循环）
> - `src/config.ts`（全局配置）
> - `web/src/views/SettingsView.vue`（现有设置页，将被重构）
> - `web/src/views/UsersView.vue`（现有用户管理，保留并集成）
> - `web/src/components/users/AclEditor.vue`（现有 ACL 编辑器，保留并集成）
> - `web/src/stores/wm.ts`（窗口注册）
> - `web/src/styles/main.css`（设计令牌 --nx-*，工业风深色主题）
> - `web/src/api/client.ts`（请求封装 + 演示降级）
> - `web/src/api/index.ts`（API 函数集合，参考现有模式）
> - `web/src/api/demo-data.ts`（演示数据，参考现有模式）

---

## 一、现状分析

当前 `SettingsView.vue` 仅包含：
- Tab 1「用户与权限」→ 嵌入 UsersView（用户列表 + 创建 + Tailscale ACL）
- Tab 2「系统信息」→ 8 个只读键值对（主机名、平台、CPU、内存等）

**缺失的 NAS 设置能力：**
常规配置、时间/NTP、服务管理、安全策略、存储策略、电源管理、通知渠道、日志审计、系统更新、备份/恢复设置、关于/诊断。

---

## 二、目标架构

将 SettingsView 重构为**左侧导航 + 右侧内容**的经典设置中心布局（类似群晖 DSM / 威联通 QTS 的设置面板）：

```
┌──────────────────────────────────────────────────────────────┐
│  系统设置                                              [✕]   │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│  ◉ 常规    │   （右侧内容区，根据左侧选中项切换）               │
│  ○ 用户    │                                                 │
│  ○ 网络    │                                                 │
│  ○ 服务    │                                                 │
│  ○ 安全    │                                                 │
│  ○ 存储    │                                                 │
│  ○ 电源    │                                                 │
│  ○ 通知    │                                                 │
│  ○ 更新    │                                                 │
│  ○ 日志    │                                                 │
│  ○ 关于    │                                                 │
│            │                                                 │
├────────────┴─────────────────────────────────────────────────┤
│  任务栏                                                      │
└──────────────────────────────────────────────────────────────┘
```

### 设计约束

- 左侧导航用 `el-menu`（vertical 模式），宽度 180px，可折叠
- 右侧内容区每个 section 是独立组件，按需加载（`<component :is>`）
- 保留现有 UsersView 和 AclEditor，集成到「用户」section
- 窗口默认尺寸调大到 `{ w: 960, h: 640 }`（在 wm.ts 中修改）
- 所有设置项的修改都需要**显式点击"保存"按钮**，不做自动保存
- 未保存修改时，导航切换需弹出确认提示（el-message-box）

---

## 三、后端 API 设计

### 新模块：`src/modules/settings/`

```
src/modules/settings/
├── settings.controller.ts
├── settings.service.ts
├── settings.routes.ts
├── settings.types.ts
├── __tests__/
│   └── settings.test.ts
└── index.ts
```

### 配置持久化

所有设置持久化到 JSON 文件：`/data/naisys/settings/system.json`

```typescript
interface SystemSettings {
  general: GeneralSettings;
  network: NetworkSettings;
  services: ServiceSettings;
  security: SecuritySettings;
  storage: StoragePolicySettings;
  power: PowerSettings;
  notification: NotificationSettings;
  update: UpdateSettings;
}
```

首次启动时若文件不存在，从默认值生成。

### API 端点

```
# ===== 通用读写 =====
GET    /api/settings
       → 返回完整 SystemSettings 对象

PUT    /api/settings/:section
       → body: 对应 section 的 partial 对象
       → section ∈ general | network | services | security | storage | power | notification | update
       → 写入 JSON + 触发对应 side-effect（如重启服务、应用 iptables）
       → 返回 { updated: string, applied: boolean }

# ===== 常规 =====
GET    /api/settings/general
       → { hostname, timezone, locale, ntpServer, ntpEnabled, description }

PUT    /api/settings/general
       → 修改主机名需调用 `hostnamectl set-hostname`
       → 修改时区需调用 `timedatectl set-timezone`
       → 修改 NTP 需调用 `timedatectl set-ntp true/false`

# ===== 服务管理 =====
GET    /api/settings/services
       → 列出所有受管服务的状态
       → { services: ManagedService[] }

POST   /api/settings/services/:name/toggle
       → body: { enabled: boolean }
       → systemctl enable/disable + start/stop
       → 返回 { name, enabled, running }

POST   /api/settings/services/:name/restart
       → systemctl restart
       → 返回 { name, running, pid }

# ===== 安全 =====
GET    /api/settings/security
       → { httpsEnabled, httpsPort, httpsCertPath, httpsKeyPath,
           sshEnabled, sshPort, sshPasswordAuth,
           maxLoginAttempts, lockoutMinutes,
           ipBlacklist: string[], ipWhitelist: string[],
           firewallEnabled, autoSecurityUpdates }

PUT    /api/settings/security
       → 应用安全策略（写 sshd_config + iptables/nftables + nginx/express https）
       → 返回 { updated: boolean, restartRequired: boolean }

# ===== 存储策略 =====
GET    /api/settings/storage
       → { diskSpindownMinutes, hddStandbyEnabled,
           smartCheckInterval, smartEmailAlert,
           trashRetentionDays, autoDefrag,
           writeCache: 'enabled'|'disabled' }

PUT    /api/settings/storage
       → 写入 hdparm / smartd.conf
       → 返回 { updated: boolean }

# ===== 电源管理 =====
GET    /api/settings/power
       → { upsEnabled, upsDevice, upsShutdownThreshold,
           scheduledPowerOn: { enabled, time },
           scheduledShutdown: { enabled, time },
           idleShutdown: { enabled, minutes },
           wakeOnLan: boolean }

PUT    /api/settings/power
       → 配置 rtcwake / systemd timer
       → 返回 { updated: boolean }

# ===== 通知渠道 =====
GET    /api/settings/notification
       → { channels: NotificationChannel[], globalMinSeverity, quietHoursStart, quietHoursEnd }

PUT    /api/settings/notification
       → 返回 { updated: boolean }

POST   /api/settings/notification/test
       → body: { channelType: 'webhook'|'email' }
       → 发送测试通知
       → 返回 { sent: boolean, error?: string }

# ===== 系统更新 =====
GET    /api/settings/update
       → { autoCheck, autoInstall, channel: 'stable'|'beta',
           lastCheck, currentVersion, latestVersion?, updateAvailable }

POST   /api/settings/update/check
       → 检查更新（离线环境：检查本地 /data/naisys/update/ 目录下的升级包）
       → 返回 { updateAvailable, latestVersion?, changelog? }

POST   /api/settings/update/install
       → 安装更新（需要 confirmToken）
       → 返回 { started: boolean, estimatedMinutes? }

# ===== 日志与诊断 =====
GET    /api/settings/logs?source=system&lines=200&level=
       → source ∈ system | auth | service | naisys
       → 读取 journalctl / /data/naisys/logs/
       → 返回 { lines: LogLine[], total: number, source }

GET    /api/settings/logs/sources
       → 可用日志源列表
       → 返回 { sources: LogSource[] }

POST   /api/settings/logs/export
       → 打包诊断信息（系统信息 + 日志 + 配置）为 tar.gz
       → 返回 { path: string, sizeBytes: number }（文件在 /data/naisys/tmp/）

DELETE /api/settings/logs/clear?source=
       → 清空指定日志
       → 返回 { cleared: string }

# ===== 关于 =====
GET    /api/settings/about
       → { version, buildDate, nodeVersion, osVersion, kernel,
           cpuModel, cpuCores, totalMemory, hostname,
           uptime, dataRoot, license }
```

### 类型定义（`settings.types.ts`）

```typescript
interface GeneralSettings {
  hostname: string;
  timezone: string;          // IANA 时区，如 "Asia/Shanghai"
  locale: string;            // 如 "zh-CN"
  ntpEnabled: boolean;
  ntpServer: string;         // 如 "ntp.aliyun.com"
  description: string;       // 设备描述
}

interface ManagedService {
  name: string;              // 如 "smbd", "nfs-server", "docker", "tailscaled", "ssh"
  displayName: string;       // 如 "SMB 文件共享"
  description: string;
  enabled: boolean;          // systemctl is-enabled
  running: boolean;          // systemctl is-active
  pid: number | null;
  uptime: number | null;     // 秒
}

interface SecuritySettings {
  httpsEnabled: boolean;
  httpsPort: number;
  httpsCertPath: string;
  httpsKeyPath: string;
  sshEnabled: boolean;
  sshPort: number;
  sshPasswordAuth: boolean;  // false = 仅密钥
  maxLoginAttempts: number;
  lockoutMinutes: number;
  ipBlacklist: string[];
  ipWhitelist: string[];
  firewallEnabled: boolean;
  autoSecurityUpdates: boolean;
}

interface StoragePolicySettings {
  diskSpindownMinutes: number;   // 0 = 从不
  hddStandbyEnabled: boolean;
  smartCheckInterval: number;    // 小时
  smartEmailAlert: boolean;
  trashRetentionDays: number;    // 回收站自动清理天数，0 = 不清理
  autoDefrag: boolean;
  writeCache: 'enabled' | 'disabled';
}

interface PowerSettings {
  upsEnabled: boolean;
  upsDevice: string;           // 如 "/dev/usb/hiddev0"
  upsShutdownThreshold: number; // 电池百分比
  scheduledPowerOn: { enabled: boolean; time: string };   // "07:00"
  scheduledShutdown: { enabled: boolean; time: string };   // "23:00"
  idleShutdown: { enabled: boolean; minutes: number };
  wakeOnLan: boolean;
}

interface NotificationChannel {
  id: string;
  type: 'webhook' | 'email';
  name: string;
  enabled: boolean;
  url?: string;               // webhook
  emailTo?: string;
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  minSeverity: 'info' | 'warning' | 'critical';
}

interface NotificationSettings {
  channels: NotificationChannel[];
  globalMinSeverity: 'info' | 'warning' | 'critical';
  quietHoursStart: string;    // "22:00"
  quietHoursEnd: string;      // "08:00"
}

interface UpdateSettings {
  autoCheck: boolean;
  autoInstall: boolean;
  channel: 'stable' | 'beta';
  lastCheck: string | null;
  currentVersion: string;
}

interface LogLine {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

interface LogSource {
  id: string;
  name: string;
  description: string;
  sizeBytes: number;
}

interface AboutInfo {
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
```

### 安全约束

- `PUT /api/settings/security` 修改 SSH 端口/密码认证时，必须保留当前 SSH 会话不断开
- IP 黑白名单操作通过 nftables 原子化执行，禁止 `iptables -F`（清空所有规则）
- 日志读取禁止暴露 `/etc/shadow`、`/boot/` 内容
- 系统更新安装需要 confirmToken 二次确认
- 所有设置变更写入审计日志 `/data/naisys/logs/settings-audit.log`

---

## 四、前端组件设计

### 文件结构

```
web/src/
├── views/
│   └── SettingsView.vue              # 重构：左导航 + 右内容
├── components/
│   └── settings/
│       ├── GeneralSettings.vue        # 常规
│       ├── UserSettings.vue           # 用户（包装现有 UsersView）
│       ├── NetworkSettings.vue        # 网络
│       ├── ServiceSettings.vue        # 服务管理
│       ├── SecuritySettings.vue       # 安全
│       ├── StorageSettings.vue        # 存储策略
│       ├── PowerSettings.vue          # 电源
│       ├── NotificationSettings.vue   # 通知
│       ├── UpdateSettings.vue         # 更新
│       ├── LogViewer.vue              # 日志
│       └── AboutPanel.vue             # 关于
├── stores/
│   └── settings.ts                   # 设置 store
└── api/
    └── types.ts                      # 追加设置相关类型
```

### 各 Section 详细 UI 设计

#### 1. 常规设置 — `GeneralSettings.vue`

```
┌─────────────────────────────────────────────────┐
│  设备名称                                        │
│  ┌──────────────────────────────────┐            │
│  │ naisys-node-01                   │            │
│  └──────────────────────────────────┘            │
│  设备描述                                        │
│  ┌──────────────────────────────────┐            │
│  │ Kane 的私有 AI NAS               │            │
│  └──────────────────────────────────┘            │
│                                                  │
│  时区        [Asia/Shanghai        ▾]            │
│  语言        [简体中文              ▾]            │
│                                                  │
│  NTP 时间同步  [● 开启]                          │
│  NTP 服务器  ┌────────────────────┐              │
│              │ ntp.aliyun.com     │              │
│              └────────────────────┘              │
│  当前时间    2026-07-27 22:15:33 CST             │
│                                                  │
│                              [保存修改]           │
└─────────────────────────────────────────────────┘
```

- 时区下拉：常用时区列表（Asia/Shanghai, UTC, America/New_York 等 20+ 项）
- 修改主机名后提示"需要重启部分服务生效"

#### 2. 用户与权限 — `UserSettings.vue`

直接包装现有 `UsersView.vue`，不改动原有组件。外层加一个标题和说明文字。

#### 3. 网络设置 — `NetworkSettings.vue`

```
┌─────────────────────────────────────────────────┐
│  网络接口                                        │
│  ┌─ eth0 ──────────────────────────────────┐    │
│  │ ● 已连接 · 2500Mb/s · r8169            │    │
│  │ IPv4: 192.168.50.10/24 (DHCP)          │    │
│  │ IPv6: fe80::1/64                       │    │
│  │ MAC: 00:11:22:33:44:55                 │    │
│  │                        [配置]           │    │
│  └────────────────────────────────────────┘    │
│  ┌─ eth1 ──────────────────────────────────┐    │
│  │ ○ 未连接 · igc                          │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  DNS 配置                                        │
│  首选 DNS  ┌────────────────┐                    │
│            │ 223.5.5.5      │                    │
│            └────────────────┘                    │
│  备用 DNS  ┌────────────────┐                    │
│            │ 8.8.8.8        │                    │
│            └────────────────┘                    │
│                                                  │
│  代理设置                                        │
│  [ ] 启用 HTTP 代理                              │
│  地址 ┌──────────────┐ 端口 ┌──────┐            │
│       │              │      │      │            │
│       └──────────────┘      └──────┘            │
│                                                  │
│                              [保存修改]           │
└─────────────────────────────────────────────────┘
```

- 接口配置弹窗：DHCP / 静态 IP 切换，静态时显示 IP/掩码/网关输入
- 注意：此页面是设置级别的网络概览，详细的防火墙/端口监控在独立的「网络配置」窗口

#### 4. 服务管理 — `ServiceSettings.vue`

```
┌─────────────────────────────────────────────────┐
│  系统服务                                        │
│                                                  │
│  服务名          状态      开机启动   操作        │
│  ─────────────────────────────────────────────   │
│  SSH 远程访问    ● 运行中   [✓]       [重启]     │
│  SMB 文件共享    ● 运行中   [✓]       [重启]     │
│  NFS 文件共享    ○ 已停止   [ ]       [启动]     │
│  Docker 引擎     ● 运行中   [✓]       [重启]     │
│  Tailscale       ● 运行中   [✓]       [重启]     │
│  FTP 服务        ○ 已停止   [ ]       [启动]     │
│  WebDAV          ○ 已停止   [ ]       [启动]     │
│  Nginx 反代      ● 运行中   [✓]       [重启]     │
│  SMART 监控      ● 运行中   [✓]       [重启]     │
│                                                  │
│  ⚠ 停止核心服务（SSH/Docker）可能导致管理中断      │
└─────────────────────────────────────────────────┘
```

- 状态列：绿色圆点=运行中，灰色=已停止，红色=异常
- 开机启动：el-switch，切换时调用 toggle API
- 操作列：运行中→[重启][停止]，已停止→[启动]
- 停止 SSH/Docker 等核心服务前弹 el-popconfirm 警告

#### 5. 安全设置 — `SecuritySettings.vue`

```
┌─────────────────────────────────────────────────┐
│  HTTPS / SSL                                     │
│  [✓] 启用 HTTPS                                  │
│  端口     ┌──────┐                               │
│           │ 443  │                               │
│           └──────┘                               │
│  证书路径  ┌────────────────────────────┐        │
│            │ /data/naisys/certs/server.crt│       │
│            └────────────────────────────┘        │
│  [上传证书] [上传私钥] [自签名生成]               │
│                                                  │
│  SSH 安全                                        │
│  [✓] 启用 SSH    端口 ┌──────┐                   │
│                       │ 22   │                   │
│                       └──────┘                   │
│  [ ] 允许密码登录（推荐仅密钥）                   │
│                                                  │
│  登录保护                                        │
│  最大尝试次数  ┌────┐  锁定时间  ┌────┐ 分钟     │
│               │ 5  │           │ 30 │           │
│               └────┘           └────┘           │
│                                                  │
│  IP 访问控制                                     │
│  黑名单  ┌──────────────────────────────┐        │
│          │ 每行一个 IP 或 CIDR          │        │
│          │ 10.0.0.99                    │        │
│          └──────────────────────────────┘        │
│  白名单  ┌──────────────────────────────┐        │
│          │ 留空 = 不限制                │        │
│          └──────────────────────────────┘        │
│                                                  │
│  [✓] 启用防火墙                                  │
│  [✓] 自动安全更新                                │
│                                                  │
│                              [保存修改]           │
└─────────────────────────────────────────────────┘
```

#### 6. 存储策略 — `StorageSettings.vue`

```
┌─────────────────────────────────────────────────┐
│  硬盘节能                                        │
│  磁盘休眠    ┌──────┐ 分钟后无操作停转 (0=从不)  │
│              │ 30   │                           │
│              └──────┘                           │
│  [✓] 启用 HDD 待机模式                           │
│                                                  │
│  SMART 监控                                      │
│  检测间隔    ┌──────┐ 小时                       │
│              │ 24   │                           │
│              └──────┘                           │
│  [✓] SMART 异常时发送通知                        │
│                                                  │
│  回收站                                          │
│  自动清理    ┌──────┐ 天后 (0=永不清理)          │
│              │ 30   │                           │
│              └──────┘                           │
│                                                  │
│  写入缓存    (●) 启用  ( ) 禁用                  │
│  ⚠ 禁用写入缓存可降低断电数据丢失风险，但会降速   │
│                                                  │
│                              [保存修改]           │
└─────────────────────────────────────────────────┘
```

#### 7. 电源管理 — `PowerSettings.vue`

```
┌─────────────────────────────────────────────────┐
│  UPS 不间断电源                                  │
│  [ ] 已连接 UPS                                  │
│  设备     ┌──────────────────────┐               │
│           │ /dev/usb/hiddev0     │               │
│           └──────────────────────┘               │
│  电池低于  ┌────┐% 时自动关机                    │
│            │ 15 │                                │
│            └────┘                                │
│                                                  │
│  定时开关机                                      │
│  [ ] 定时开机    时间 ┌────────┐                 │
│                       │ 07:00  │                 │
│                       └────────┘                 │
│  [ ] 定时关机    时间 ┌────────┐                 │
│                       │ 23:00  │                 │
│                       └────────┘                 │
│                                                  │
│  空闲自动关机                                    │
│  [ ] 无活动超过  ┌──────┐ 分钟后关机             │
│                 │ 120  │                         │
│                 └──────┘                         │
│                                                  │
│  [✓] 启用 Wake-on-LAN                            │
│                                                  │
│                              [保存修改]           │
└─────────────────────────────────────────────────┘
```

#### 8. 通知设置 — `NotificationSettings.vue`

```
┌─────────────────────────────────────────────────┐
│  通知渠道                                        │
│  ┌─ Webhook ────────────────────────────────┐   │
│  │ [✓] 启用   名称 ┌──────────┐             │   │
│  │                  │ 企业微信  │             │   │
│  │                  └──────────┘             │   │
│  │ URL ┌──────────────────────────────┐     │   │
│  │     │ https://qyapi.weixin.qq.com/│     │   │
│  │     └──────────────────────────────┘     │   │
│  │ 最低级别 [warning ▾]    [测试] [删除]    │   │
│  └──────────────────────────────────────────┘   │
│  [+ 添加渠道]                                    │
│                                                  │
│  全局设置                                        │
│  默认最低级别  [info ▾]                          │
│  免打扰时段    ┌────────┐ 至 ┌────────┐         │
│               │ 22:00  │    │ 08:00  │         │
│               └────────┘    └────────┘         │
│                                                  │
│                              [保存修改]           │
└─────────────────────────────────────────────────┘
```

- 测试按钮：调用 `POST /api/settings/notification/test`，显示发送结果
- 添加渠道：el-dialog 选择类型（Webhook / Email），填写对应字段

#### 9. 系统更新 — `UpdateSettings.vue`

```
┌─────────────────────────────────────────────────┐
│  当前版本                                        │
│  ┌──────────────────────────────────────────┐   │
│  │  NAISys v0.1.0                           │   │
│  │  构建日期: 2026-07-27                     │   │
│  │  更新通道: [stable ▾]                     │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  [✓] 自动检查更新                                │
│  [ ] 自动安装更新（不推荐）                      │
│                                                  │
│  上次检查: 2026-07-27 20:00                      │
│                                                  │
│  ┌─ 检查结果 ──────────────────────────────┐    │
│  │  ✓ 当前已是最新版本                      │    │
│  │  （或：⬆ v0.2.0 可用 — 查看更新日志）    │    │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  [检查更新]                                      │
│                                                  │
│  ⚠ 离线环境：将升级包放入 /data/naisys/update/   │
│    目录后点击"检查更新"即可识别                   │
└─────────────────────────────────────────────────┘
```

#### 10. 日志查看器 — `LogViewer.vue`

```
┌─────────────────────────────────────────────────┐
│  日志源  [system ▾]  级别 [全部 ▾]  行数 [200]  │
│  [刷新] [导出诊断包] [清空日志]                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 2026-07-27 22:10:01 [INFO]  naisys       │   │
│  │   服务启动完成，监听 127.0.0.1:3000      │   │
│  │ 2026-07-27 22:10:03 [WARN]  smartd       │   │
│  │   /dev/sdc SMART 健康检查未通过           │   │
│  │ 2026-07-27 22:10:05 [INFO]  docker       │   │
│  │   容器 ollama 启动成功                    │   │
│  │ ...                                      │   │
│  │                                          │   │
│  └──────────────────────────────────────────┘   │
│  共 1,247 条 · 显示最近 200 条                   │
└─────────────────────────────────────────────────┘
```

- 日志源下拉：system / auth / docker / tailscale / naisys / smartd
- 级别过滤：全部 / info / warn / error
- 日志行按级别着色：info=默认、warn=琥珀、error=红色
- 等宽字体，自动滚动到底部
- 导出诊断包：下载 tar.gz（含系统信息 + 最近日志 + 配置快照）
- 清空日志：el-popconfirm 二次确认

#### 11. 关于 — `AboutPanel.vue`

```
┌─────────────────────────────────────────────────┐
│                                                  │
│              ██  NAISys                          │
│              PRIVATE AI NAS                      │
│                                                  │
│  版本        v0.1.0                              │
│  构建日期    2026-07-27                          │
│  Node.js     v22.16.0                            │
│  操作系统    Debian 13 (Trixie)                  │
│  内核        Linux 6.12.0-trixie                 │
│  CPU         AMD Ryzen 7 5800X · 16 核          │
│  内存        32 GB                               │
│  主机名      naisys-node-01                      │
│  运行时长    14 天 21 小时                       │
│  数据目录    /data                               │
│  许可证      MIT                                 │
│                                                  │
│  [导出诊断信息]  [重启系统]  [关机]              │
│                                                  │
└─────────────────────────────────────────────────┘
```

- 重启/关机按钮：el-popconfirm 三次确认（输入 "confirm" 文字确认）
- 后端 API：`POST /api/system/reboot`、`POST /api/system/shutdown`（需要 confirmToken）

---

## 五、Store 设计 — `stores/settings.ts`

```typescript
import { defineStore } from 'pinia';

export const useSettingsStore = defineStore('settings', () => {
  // === state ===
  const activeSection = ref('general');
  const settings = ref<SystemSettings | null>(null);
  const services = ref<ManagedService[]>([]);
  const about = ref<AboutInfo | null>(null);
  const logs = ref<LogLine[]>([]);
  const logSources = ref<LogSource[]>([]);
  const dirty = ref(false);          // 有未保存修改
  const saving = ref(false);
  const loading = ref(false);

  // === getters ===
  const sectionList = computed(() => [
    { id: 'general',      label: '常规',     icon: 'Setting' },
    { id: 'users',        label: '用户',     icon: 'User' },
    { id: 'network',      label: '网络',     icon: 'Connection' },
    { id: 'services',     label: '服务',     icon: 'Operation' },
    { id: 'security',     label: '安全',     icon: 'Lock' },
    { id: 'storage',      label: '存储',     icon: 'Coin' },
    { id: 'power',        label: '电源',     icon: 'Lightning' },
    { id: 'notification', label: '通知',     icon: 'Bell' },
    { id: 'update',       label: '更新',     icon: 'Upload' },
    { id: 'logs',         label: '日志',     icon: 'Document' },
    { id: 'about',        label: '关于',     icon: 'InfoFilled' },
  ]);

  // === actions ===
  async function fetchSettings() { ... }
  async function saveSection(section: string) { ... }
  async function fetchServices() { ... }
  async function toggleService(name: string, enabled: boolean) { ... }
  async function restartService(name: string) { ... }
  async function fetchAbout() { ... }
  async function fetchLogs(source: string, lines: number, level?: string) { ... }
  async function exportDiagnostics() { ... }
  async function checkUpdate() { ... }
  async function testNotification(channelType: string) { ... }
  function markDirty() { dirty.value = true; }

  return { ... };
});
```

---

## 六、SettingsView.vue 重构方案

```vue
<script setup lang="ts">
/**
 * 系统设置中心 — 左导航 + 右内容
 * 重构自原版双 tab 布局
 */
import { ref, computed, watch } from 'vue';
import { ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

// 各 section 组件
import GeneralSettings from '@/components/settings/GeneralSettings.vue';
import UserSettings from '@/components/settings/UserSettings.vue';
import NetworkSettings from '@/components/settings/NetworkSettings.vue';
import ServiceSettings from '@/components/settings/ServiceSettings.vue';
import SecuritySettings from '@/components/settings/SecuritySettings.vue';
import StorageSettings from '@/components/settings/StorageSettings.vue';
import PowerSettings from '@/components/settings/PowerSettings.vue';
import NotificationSettings from '@/components/settings/NotificationSettings.vue';
import UpdateSettings from '@/components/settings/UpdateSettings.vue';
import LogViewer from '@/components/settings/LogViewer.vue';
import AboutPanel from '@/components/settings/AboutPanel.vue';

const store = useSettingsStore();
const { activeSection, sectionList, dirty } = storeToRefs(store);

const componentMap = {
  general: GeneralSettings,
  users: UserSettings,
  network: NetworkSettings,
  services: ServiceSettings,
  security: SecuritySettings,
  storage: StorageSettings,
  power: PowerSettings,
  notification: NotificationSettings,
  update: UpdateSettings,
  logs: LogViewer,
  about: AboutPanel,
};

const currentComponent = computed(() => componentMap[activeSection.value]);

// 切换 section 时，若有未保存修改则提示
async function switchSection(id: string) {
  if (dirty.value && activeSection.value !== id) {
    try {
      await ElMessageBox.confirm(
        '当前页面有未保存的修改，切换将丢失更改。',
        '未保存修改',
        { confirmButtonText: '放弃修改', cancelButtonText: '留在当前页', type: 'warning' },
      );
      dirty.value = false;
    } catch {
      return; // 用户取消
    }
  }
  activeSection.value = id;
}
</script>

<template>
  <div class="settings-center">
    <el-menu
      :default-active="activeSection"
      class="settings-nav"
      @select="switchSection"
    >
      <el-menu-item v-for="s in sectionList" :key="s.id" :index="s.id">
        <el-icon><component :is="s.icon" /></el-icon>
        <span>{{ s.label }}</span>
      </el-menu-item>
    </el-menu>

    <div class="settings-content">
      <component :is="currentComponent" />
    </div>
  </div>
</template>
```

---

## 七、演示数据

在 `web/src/api/demo-data.ts` 中追加：

```typescript
export function demoSettings(): SystemSettings { ... }
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
export function demoAbout(): AboutInfo { ... }
export function demoLogs(source: string): LogLine[] { ... }
export function demoLogSources(): LogSource[] { ... }
```

---

## 八、API 层追加

在 `web/src/api/index.ts` 中追加：

```typescript
export const settingsApi = {
  getAll: () => request<SystemSettings>({ url: '/settings' }, demo.demoSettings),
  getSection: (section: string) => request<unknown>({ url: `/settings/${section}` }),
  updateSection: (section: string, data: unknown) =>
    request<{ updated: string; applied: boolean }>({ url: `/settings/${section}`, method: 'put', data }),
  services: () => request<{ services: ManagedService[] }>({ url: '/settings/services' }, () => ({ services: demo.demoServices() })),
  toggleService: (name: string, enabled: boolean) =>
    request<{ name: string; enabled: boolean; running: boolean }>({ url: `/settings/services/${name}/toggle`, method: 'post', data: { enabled } }),
  restartService: (name: string) =>
    request<{ name: string; running: boolean; pid: number }>({ url: `/settings/services/${name}/restart`, method: 'post' }),
  about: () => request<AboutInfo>({ url: '/settings/about' }, demo.demoAbout),
  logs: (source: string, lines = 200, level?: string) =>
    request<{ lines: LogLine[]; total: number; source: string }>(
      { url: '/settings/logs', params: { source, lines, level } },
      () => ({ lines: demo.demoLogs(source), total: 200, source }),
    ),
  logSources: () => request<{ sources: LogSource[] }>({ url: '/settings/logs/sources' }, () => ({ sources: demo.demoLogSources() })),
  exportDiagnostics: () => request<{ path: string; sizeBytes: number }>({ url: '/settings/logs/export', method: 'post' }),
  clearLogs: (source: string) => request<{ cleared: string }>({ url: '/settings/logs/clear', method: 'delete', params: { source } }),
  checkUpdate: () => request<{ updateAvailable: boolean; latestVersion?: string; changelog?: string }>({ url: '/settings/update/check', method: 'post' }),
  testNotification: (channelType: string) =>
    request<{ sent: boolean; error?: string }>({ url: '/settings/notification/test', method: 'post', data: { channelType } }),
};
```

---

## 九、窗口注册修改

在 `wm.ts` 中将 settings 窗口的 defaultSize 改为 `{ w: 960, h: 640 }`。

---

## 十、开发顺序与验证

1. 后端：创建 `src/modules/settings/` 模块 → 路由注册 → 测试
2. 前端：创建 `stores/settings.ts` → API 层追加 → 11 个 section 组件 → 重构 SettingsView
3. 每完成一个 section 组件：`pnpm web:lint && pnpm web:build`
4. 全部完成后：`pnpm lint && pnpm build && pnpm test && pnpm web:lint && pnpm web:build && pnpm web:test`
5. 确保演示模式下所有 11 个 section 可正常渲染

### 测试要求

后端：
- 设置读写 CRUD
- section 参数校验（非法 section → 400）
- 服务操作 mock（不真正 systemctl）
- 日志读取不暴露敏感文件
- 安全设置修改的审计日志写入

前端：
- 各 section 组件渲染测试（mount + 演示数据）
- 未保存修改切换拦截测试
- 服务开关交互测试
