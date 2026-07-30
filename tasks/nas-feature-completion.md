# 任务书：Vibe OS 功能补全 — 对齐成熟 NAS 产品

> 本文件是 Hermes Agent 的完整开发任务指令。读取后按 Phase 顺序执行，每个 Phase 有明确验证标准。
> 目标：将 Vibe OS 从"管理面板"提升为功能完整的 NAS 操作系统，对齐群晖 DSM / 威联通 QTS / TrueNAS 核心能力。
> 前置依赖：`tasks/oidc-provider.md`（OIDC Provider 任务书）应先完成或并行推进 Phase 1-2。

---

## 0. 项目约束（强制）

- 项目根目录：`/mnt/d/Kane/OrcaWorkSpaces/Vibe-OS`
- 先读 `AGENTS.md`，所有安全红线、目录规范、交付标准必须遵守
- 技术栈锁定：Express 5 + TypeScript strict + Vue 3 + Vite + Element Plus + Pinia + pnpm monorepo
- 数据目录：`/data/vibeos/`，密钥存 `/data/vibeos/secrets/`（0700）
- 禁止外网依赖：所有功能完全本地运行
- 禁止 root 运行，服务用户 `vibeos`
- 环境变量前缀：`VIBEOS_`
- 开发数据目录：`VIBEOS_DATA_ROOT=/tmp/vibeos-data`
- 迭代流水线：`pnpm lint → pnpm build → pnpm test`，不通过自行修复，5 轮上限
- 测试覆盖率 ≥ 80%，禁止删测试凑通过
- 提交规范：Conventional Commits
- 系统操作必须通过 `src/system/` 原子化 API 层，禁止业务代码裸 exec/spawn

---

## 1. 当前架构快照

```
后端模块（17 个）：
  apps / auth / backup / container / download / filemanager /
  hardware / metrics / network / notification / oidc /
  scheduler / settings / sharing / storage / system-init / user

前端视图（14 个）：
  Apps / Backup / Dashboard / Desktop / Download / Files /
  Monitor / Network / Scheduler / Settings / Sharing / Storage /
  Tailscale / Users

系统层（src/system/）：
  command-executor / disk / docker / filesystem / metrics /
  network / ssh-keys / tailscale / tls

ISO 服务：
  vibeos-web-console / vibeos-firstboot / vibeos-data-guard /
  vibeos-ota / docker / tailscaled
```

---

## 2. Phase 总览

| Phase | 主题 | 优先级 | 预估模块数 |
|-------|------|--------|-----------|
| 1 | 文件服务增强（版本控制 + 全文搜索 + 预览 + 缩略图） | P0 | 2 |
| 2 | 协议补全（FTP/SFTP + 反向代理 + DDNS） | P0 | 2 |
| 3 | 安全加固（2FA + 审计日志 + IP 封禁 + 证书管理 UI） | P0 | 3 |
| 4 | 存储增强（RAID 管理 UI + 卷加密 + SSD 缓存 + iSCSI） | P1 | 2 |
| 5 | 媒体服务（DLNA + 照片管理 + 视频转码 + 音乐串流） | P1 | 2 |
| 6 | 网络进阶（VLAN + LACP + VPN Server + QoS + DNS） | P2 | 2 |
| 7 | 运维与生态（安装向导 + 全局搜索 + UPS/NUT + SNMP + 应用自动更新） | P2 | 3 |
| 8 | 体验打磨（多语言补全 + 亮色主题 + USB 备份 + 回收站策略） | P3 | 2 |

---

## 3. Phase 1：文件服务增强

### 3.1 文件版本控制

目录：`src/modules/fileversion/`

功能：
- 共享文件夹级别的版本策略配置（关闭 / 简单版本 / 多版本旋转）
- 文件修改时自动保存旧版本到 `/data/vibeos/versions/{share}/{path}/.versions/`
- 版本保留策略：最多 N 个版本（默认 32）或最多保留 N 天（默认 30）
- 版本恢复：将指定版本恢复为当前文件
- 版本对比：文本文件 diff（可选）
- 版本清理：按策略自动清理过期版本（接入 scheduler 模块）

API：
```
GET    /api/files/versions?path=...           列出版本历史
GET    /api/files/versions/download?path=...&version=N  下载指定版本
POST   /api/files/versions/restore            恢复指定版本
DELETE /api/files/versions?path=...&version=N 删除指定版本
GET    /api/files/versions/policy?share=...   获取版本策略
PUT    /api/files/versions/policy             设置版本策略
```

前端：
- FilesView 文件详情面板新增"版本历史"标签页
- 版本列表：版本号、时间、大小、操作（下载/恢复/删除）
- 共享文件夹设置中新增"版本控制"配置项

### 3.2 全文搜索

目录：`src/modules/search/`

功能：
- 基于 SQLite FTS5 的本地全文索引（零外网依赖，无需 Elasticsearch）
- 索引范围：`/data/` 下所有用户文件（文件名 + 文本内容）
- 支持文件类型：txt / md / json / yaml / csv / log / 代码文件
- 增量索引：inotify / 定时扫描（每 5 分钟）检测变更
- 搜索语法：关键词 AND/OR、文件名过滤、路径前缀、文件类型、时间范围
- 搜索结果：文件名高亮、路径、大小、修改时间、内容摘要（匹配行 ± 2 行）

API：
```
GET  /api/search?q=...&type=...&path=...&from=...&to=...&page=...&size=...
GET  /api/search/status          索引状态（文件数、大小、最后更新时间）
POST /api/search/reindex         手动触发全量重建
```

前端：
- 桌面顶部全局搜索栏（Ctrl+K 快捷键唤起）
- 搜索结果窗口：列表视图 + 预览面板
- 设置中心新增"搜索"分区：索引范围、排除目录、重建索引按钮

### 3.3 文件预览与缩略图

目录：`src/modules/filemanager/` 扩展

功能：
- 图片预览：jpg / png / gif / webp / svg / bmp（直接 serve）
- PDF 预览：pdf.js 前端渲染
- 文本/代码预览：语法高亮（highlight.js / shiki）
- 视频预览：HTML5 video 标签 + 服务端 range 请求
- 音频预览：HTML5 audio 标签
- Office 预览：暂不支持（标记 TODO）
- 缩略图生成：图片文件自动生成 256px 缩略图（sharp 库），缓存到 `/data/vibeos/cache/thumbs/`
- 视频封面：ffmpeg 截取第 1 秒帧（如系统有 ffmpeg）

API：
```
GET /api/files/preview?path=...       获取预览内容（按 MIME 分发）
GET /api/files/thumbnail?path=...     获取缩略图（256px）
```

前端：
- FilesView 列表视图：图片/视频文件显示缩略图图标
- 双击文件打开预览窗口（WebOS 窗口内嵌）
- 预览窗口支持：图片缩放、PDF 翻页、代码行号、视频播放

---

## 4. Phase 2：协议补全

### 4.1 FTP/SFTP 服务

目录：`src/modules/ftp/`

功能：
- 管理 vsftpd（FTP）和 sshd（SFTP）的配置与生命周期
- FTP 配置：端口、被动模式端口范围、匿名访问开关、TLS 加密（FTPS）
- SFTP 配置：复用系统 sshd，管理 sftp-only 用户（ChrootDirectory）
- 用户级 FTP 权限：允许/禁止、根目录限定、带宽限制
- 连接日志：记录登录/上传/下载/删除操作

API：
```
GET  /api/ftp/status              服务状态（FTP + SFTP）
PUT  /api/ftp/config              更新 FTP 配置
POST /api/ftp/start|stop|restart  服务控制
GET  /api/ftp/logs                连接日志
PUT  /api/ftp/users/:uid          用户 FTP 权限
```

前端：
- 设置中心 > 服务 分区新增 FTP/SFTP 配置卡片
- 或独立"文件服务"视图：FTP / SFTP / SMB / NFS / WebDAV 统一管理

### 4.2 反向代理

目录：`src/modules/proxy/`

功能：
- 内置 nginx 配置管理（生成 /etc/nginx/conf.d/ 下的 vhost）
- 规则管理：域名/路径 → 后端服务（IP:Port）映射
- 自动 HTTPS：对接 ACME（本地 CA 或 Let's Encrypt，离线时用自签）
- 与应用中心联动：部署应用时可选"自动创建反向代理规则"
- WebSocket 透传支持
- 访问日志 + 错误日志

API：
```
GET    /api/proxy/rules            规则列表
POST   /api/proxy/rules            创建规则
PUT    /api/proxy/rules/:id        更新规则
DELETE /api/proxy/rules/:id        删除规则
POST   /api/proxy/reload           重载 nginx
GET    /api/proxy/certs            证书列表
POST   /api/proxy/certs            上传/生成证书
```

前端：
- 设置中心 > 网络 分区新增"反向代理"标签页
- 规则表格：域名、路径、目标、HTTPS、状态
- 创建/编辑对话框

### 4.3 DDNS（可选，离线环境降级）

- 支持 Cloudflare /阿里云 DNS / 自定义 HTTP 接口
- 离线环境自动禁用，仅在线时生效
- 设置中心 > 网络 > DDNS 配置

---

## 5. Phase 3：安全加固

### 5.1 双因素认证（2FA / TOTP）

目录：`src/modules/auth/` 扩展

功能：
- TOTP（RFC 6238）：兼容 Google Authenticator / Authy / 1Password
- 用户级开关：管理员可强制全员开启
- 绑定流程：生成 secret → 显示二维码（otpauth:// URI）→ 验证 6 位码 → 启用
- 备用码：生成 10 个一次性备用码（bcrypt 存储）
- 登录流程改造：密码正确后若启用 2FA 则要求输入 TOTP 码
- API 访问：Bearer token 不受 2FA 影响（token 本身是第二因素）

API：
```
POST /api/auth/2fa/setup          生成 secret + 二维码 URI
POST /api/auth/2fa/verify         验证 TOTP 码并启用
POST /api/auth/2fa/disable        关闭 2FA（需密码确认）
GET  /api/auth/2fa/backup-codes   查看备用码（仅一次）
POST /api/auth/2fa/regenerate     重新生成备用码
```

前端：
- 登录页：密码通过后显示 TOTP 输入框（6 位数字）
- 设置中心 > 用户 > 个人安全：2FA 绑定/解绑、备用码
- 管理员面板：强制全员 2FA 开关

依赖：`otpauth`（纯 JS TOTP 实现）+ `qrcode`（生成二维码 data URI）

### 5.2 审计日志

目录：`src/modules/audit/`

功能：
- 记录所有 API 操作：who（uid/username）、what（method + path）、when、where（IP）、result（status code）
- 敏感操作高亮：登录/登出、用户创建/删除、文件删除、权限变更、服务启停
- 存储：SQLite（`/data/vibeos/audit/audit.db`），自动轮转（保留 90 天）
- 查询：按用户、时间范围、操作类型、IP 过滤
- 导出：CSV / JSON

API：
```
GET /api/audit/logs?user=...&action=...&from=...&to=...&page=...
GET /api/audit/stats              统计摘要（今日操作数、登录次数、告警数）
POST /api/audit/export            导出
```

前端：
- 设置中心 > 日志 分区新增"审计日志"标签页
- 表格：时间、用户、操作、IP、结果
- 过滤器 + 时间范围选择器

实现：Express 中间件（`auditMiddleware`），在 authGuard 之后、路由之前挂载。

### 5.3 IP 自动封禁

目录：`src/modules/security/`

功能：
- 登录失败 N 次（默认 5）自动封禁 IP（默认 24h）
- 封禁实现：iptables / nftables DROP 规则
- 白名单：管理员 IP 永不封禁
- 手动封禁/解封
- 封禁日志

API：
```
GET    /api/security/banned        封禁列表
POST   /api/security/ban           手动封禁
DELETE /api/security/ban/:ip       解封
GET    /api/security/policy        封禁策略
PUT    /api/security/policy        更新策略
```

前端：
- 设置中心 > 安全 分区新增"IP 封禁"卡片
- 封禁列表 + 策略配置

### 5.4 证书管理 UI

扩展现有 `src/system/tls.ts`：

- 前端管理界面：查看当前证书、上传新证书、生成自签证书、查看过期时间
- 支持 Let's Encrypt（在线时）+ 本地 CA（离线时）
- 证书部署到 nginx / vsftpd / 系统服务

---

## 6. Phase 4：存储增强

### 6.1 RAID 管理 UI

扩展 `src/modules/storage/`：

功能：
- 创建 RAID：RAID 0 / 1 / 5 / 6 / 10（mdadm）
- 阵列状态：在线/降级/重建中、成员盘、热备盘
- 操作：添加磁盘、移除磁盘、重建、扩展
- SMART 集成：成员盘健康监控
- 存储空间（Volume）管理：在 RAID 上创建 LVM 逻辑卷、格式化（ext4/btrfs）、挂载

前端：
- StorageView 重构：
  - 上半：物理磁盘列表（现有）
  - 中部：RAID 阵列卡片（状态、成员盘、容量、操作按钮）
  - 下部：存储空间/卷列表（挂载点、使用率、文件系统）
- 创建阵列向导：选盘 → 选 RAID 级别 → 确认 → 创建

### 6.2 卷加密（LUKS）

- 创建加密卷：LUKS2 + passphrase / keyfile
- 解锁/锁定卷
- 密钥管理：keyfile 存 `/data/vibeos/secrets/luks/`（0700）
- 开机自动解锁（可选，需 keyfile）

### 6.3 SSD 缓存

- 将 SSD 配置为 HDD 阵列的读/写缓存（dm-cache / lvmcache）
- 缓存状态监控：命中率、温度、寿命
- 前端：存储池设置中新增"SSD 缓存"配置

### 6.4 iSCSI Target

- 基于 targetcli / LIO 的 iSCSI 目标管理
- 创建 Target + LUN（映射到逻辑卷或文件）
- 访问控制：CHAP 认证 + Initiator IQN 白名单
- 前端：存储 > iSCSI 标签页

---

## 7. Phase 5：媒体服务

### 7.1 DLNA / UPnP 媒体服务器

目录：`src/modules/media/`

功能：
- 基于 minidlna（ReadyMedia）的 DLNA 服务管理
- 媒体库配置：指定共享文件夹为媒体源（视频/音乐/图片分类）
- 自动扫描 + inotify 增量更新
- 客户端发现：局域网电视/音箱/游戏机自动发现 NAS 媒体

API：
```
GET  /api/media/status            DLNA 服务状态
PUT  /api/media/config            媒体库配置
POST /api/media/rescan            重新扫描
GET  /api/media/clients           已连接客户端
```

### 7.2 照片管理

目录：`src/modules/photos/`

功能：
- 照片库：按时间线浏览（年/月/日分组）
- 相册：手动创建 + 按目录自动
- EXIF 读取：拍摄时间、相机、GPS（地图展示可选）
- 缩略图 + 原图浏览
- 幻灯片播放
- 共享链接：生成只读访问链接（带过期时间）

前端：
- 新增 PhotosView（WebOS 窗口）
- 瀑布流 / 时间线 / 相册三种视图
- 灯箱模式（全屏浏览 + 左右切换）

### 7.3 视频转码

- 基于 ffmpeg 的转码任务管理
- 硬件加速：VAAPI / NVENC（自动检测）
- 转码队列：优先级、并发数限制
- 预设：1080p H.264 / 720p H.264 / 480p / 原始
- 前端：下载中心旁新增"转码"标签页或独立窗口

### 7.4 音乐串流

- 基于 Navidrome 或自研轻量串流
- 播放列表管理
- Web 播放器（Howler.js）
- 前端：独立音乐窗口（封面 + 进度条 + 播放列表）

---

## 8. Phase 6：网络进阶

### 8.1 VLAN 管理

- 802.1Q VLAN 创建/删除（ip link add ... type vlan）
- VLAN 接口绑定到物理网卡
- 前端：网络配置 > VLAN 标签页

### 8.2 链路聚合（LACP）

- bonding 模式管理（balance-rr / active-backup / 802.3ad）
- 成员网卡选择
- 状态监控：聚合带宽、成员状态
- 前端：网络配置 > 链路聚合

### 8.3 VPN 服务器

- WireGuard 服务端：生成密钥对、管理 peer、分配内网 IP
- OpenVPN 服务端（可选）：证书生成、客户端配置导出
- 前端：新增 VPN 视图（peer 列表 + 二维码配置导出）

### 8.4 QoS 带宽控制

- tc（traffic control）规则管理
- 按 IP / 端口 / 协议限速
- 前端：网络配置 > QoS

### 8.5 DNS 服务器

- 基于 dnsmasq 的本地 DNS
- 自定义记录（A / CNAME / PTR）
- 上游 DNS 配置
- 前端：网络配置 > DNS 服务器

---

## 9. Phase 7：运维与生态

### 9.1 首次安装向导

文件：`web/src/views/SetupWizard.vue`

功能：
- ISO 安装后首次访问 Web UI 时自动进入向导（检测 `/data/vibeos/.initialized` 标记）
- 步骤：
  1. 欢迎 + 语言选择
  2. 管理员账号设置（用户名 + 密码 + 2FA 可选）
  3. 存储初始化（选择磁盘 → 创建存储池 → 格式化）
  4. 网络配置（DHCP / 静态 IP）
  5. 服务选择（启用哪些服务：SMB/FTP/DLNA/Docker）
  6. 完成 → 创建标记文件 → 跳转桌面
- 全屏路由，不在 WebOS 窗口内

### 9.2 全局搜索

- 桌面顶部搜索栏（Ctrl+K）
- 搜索范围：文件（Phase 1 的 FTS5）+ 应用 + 设置项 + 用户
- 搜索结果分类展示
- 快速操作：打开文件、启动应用、跳转设置

### 9.3 UPS 集成（NUT）

- 对接 nut-server / nut-client
- UPS 状态监控：电量、负载、输入电压、运行时间
- 策略：电量低于 N% 时安全关机
- 前端：设置中心 > 电源 > UPS 状态卡片（替换现有占位 UI）

### 9.4 SNMP 监控

- 启用 snmpd，配置 community string
- 系统 OID：CPU / 内存 / 磁盘 / 网络 / 温度
- 前端：设置中心 > 服务 > SNMP 配置

### 9.5 应用自动更新

- 应用中心定期检查已安装应用的镜像更新（docker pull --dry-run 等价）
- 离线环境：手动导入新镜像后提示"有可用更新"
- 更新策略：手动 / 自动（维护窗口内）
- 更新前自动快照（对接 backup 模块）

---

## 10. Phase 8：体验打磨

### 10.1 多语言补全

- 现有 i18n 框架（zh-CN / en）补全所有新增模块的翻译
- 新增语言：日语（ja）、韩语（ko）（可选）
- 设置中心 > 常规 > 语言切换即时生效

### 10.2 亮色主题

- CSS 变量体系：现有 `--nx-*` 变量扩展为 `light` / `dark` 两套
- 主题切换：设置中心 > 常规 > 外观（深色 / 浅色 / 跟随系统）
- 默认保持深色工业风

### 10.3 USB 外设备备

- USB 插入自动检测（udev rule + systemd service）
- 备份策略：一键复制 / 增量同步（rsync）/ 双向同步
- 前端：插入 USB 后桌面弹出通知 + 快捷操作
- 设置中心 > 备份 > USB 备份配置

### 10.4 回收站策略

- 按共享文件夹配置回收站开关
- 回收站保留策略：天数 / 大小上限
- 回收站排除规则（按扩展名 / 路径）
- 前端：共享文件夹设置中新增回收站配置

---

## 11. 通用开发规范

### 11.1 模块目录结构（每个新模块必须遵守）

```
src/modules/{module}/
├── {module}.types.ts        类型定义
├── {module}.dao.ts          持久化（JSON/SQLite 文件读写）
├── {module}.service.ts      业务逻辑
├── {module}.controller.ts   请求处理（zod 校验）
├── {module}.routes.ts       路由定义
├── index.ts                 导出
└── __tests__/
    └── {module}.test.ts     单元 + 集成测试
```

### 11.2 前端组件规范

- 视图文件：`web/src/views/{Name}View.vue`
- 组件文件：`web/src/components/{module}/{Component}.vue`
- Store 文件：`web/src/stores/{module}.ts`
- API 函数追加到 `web/src/api/index.ts`
- 类型追加到 `web/src/api/types.ts`
- 演示数据追加到 `web/src/api/demo-data.ts`
- WebOS 窗口注册：`web/src/stores/wm.ts`

### 11.3 系统命令封装

所有系统命令必须通过 `src/system/command-executor.ts` 执行：
```typescript
// 正确
const result = await execCommand('mdadm', ['--create', ...]);

// 错误（禁止）
exec('mdadm --create ...');
```

### 11.4 持久化选择

| 数据类型 | 存储方式 | 路径 |
|---------|---------|------|
| 配置（小量 KV） | JSON 文件 | `/data/vibeos/settings/{module}.json` |
| 结构化记录（日志/审计） | SQLite | `/data/vibeos/{module}/{module}.db` |
| 搜索索引 | SQLite FTS5 | `/data/vibeos/search/index.db` |
| 密钥/证书 | JSON（0700） | `/data/vibeos/secrets/` |
| 缓存（缩略图等） | 文件 | `/data/vibeos/cache/` |

### 11.5 测试要求

- 每个模块 ≥ 15 个测试用例
- 覆盖：正常流程 + 参数校验 + 权限校验 + 边界条件 + 错误处理
- 系统命令 mock（`vi.mock('child_process')`），测试不依赖真实系统状态
- API 测试用 Supertest + 内存数据目录

### 11.6 文档要求

- 每个 Phase 完成后更新 `docs/api/openapi.yaml`
- 新增模块写 `docs/{module}-guide.md`（用户指南）
- README 功能列表同步更新

---

## 12. 允许新增的依赖

| 包 | 用途 | Phase |
|---|---|---|
| `better-sqlite3` | SQLite（FTS5 搜索 + 审计日志） | 1, 3 |
| `sharp` | 图片缩略图生成 | 1 |
| `otpauth` | TOTP 2FA | 3 |
| `qrcode` | 2FA 二维码生成 | 3 |
| `node-pty`（可选） | 终端 WebSocket（未来） | — |

前端：
| 包 | 用途 | Phase |
|---|---|---|
| `highlight.js` | 代码预览语法高亮 | 1 |
| `pdfjs-dist` | PDF 预览 | 1 |
| `howler` | 音频播放 | 5 |

系统级（ISO 构建时安装，非 npm）：
```
vsftpd / nginx / minidlna / ffmpeg / mdadm / cryptsetup /
targetcli-fb / nut-server / snmpd / dnsmasq / wireguard /
vlan / ifenslave / tc / inotify-tools
```

---

## 13. 执行策略

```
每个 Phase 的执行流程：
  1. 创建功能分支 feat/{phase-name}
  2. 后端模块开发（types → dao → service → controller → routes → tests）
  3. 前端开发（types → api → store → components → views → wm 注册）
  4. 集成到 app.ts + 路由注册
  5. pnpm lint && pnpm build && pnpm test 全绿
  6. pnpm web:build 全绿
  7. 浏览器验证 UI（截图确认）
  8. 更新 openapi.yaml + README
  9. 提交 + 输出测试摘要

Phase 间依赖：
  Phase 1（搜索）→ Phase 7（全局搜索）依赖 FTS5 索引
  Phase 2（反向代理）→ Phase 5（媒体）可选依赖
  Phase 3（2FA）→ 依赖 oidc-provider 任务书的 auth 模块
  Phase 4（RAID）→ Phase 1（版本控制）的快照可复用
  其余 Phase 可并行

优先级说明：
  P0 = 没有就不像 NAS，必须做
  P1 = 家用 NAS 核心卖点，强烈建议
  P2 = 进阶/极客功能，锦上添花
  P3 = 体验打磨，长期迭代
```

---

## 14. 验收标准（全部 Phase 完成后）

| 维度 | 标准 |
|------|------|
| 功能覆盖 | 本任务书所有 API 端点可调用，前端可操作 |
| 测试 | `pnpm test` 全通过，覆盖率 ≥ 80% |
| 构建 | `pnpm build` + `pnpm web:build` 零错误 |
| Lint | `pnpm lint` 零警告 |
| 安全 | 无裸 exec、无硬编码密钥、路径穿越防护、权限校验 |
| 文档 | openapi.yaml 完整、README 更新、每模块有 guide |
| ISO | `iso/build-iso.sh` 可构建（新增系统包已加入 packages/） |
| 离线 | 断网环境下所有功能正常（在线增强功能优雅降级） |
