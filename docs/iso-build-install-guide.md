# NAISys ISO 构建与安装手册

> 版本：v1.0 · 适用：NAISys（Debian 13 Trixie amd64）
> 目标：类消费电子级极简安装体验——零交互、可视化进度、5 分钟内完成。

---

## 目录

1. [概述](#1-概述)
2. [集成驱动列表](#2-集成驱动列表)
3. [ISO 构建](#3-iso-构建)
4. [安装步骤](#4-安装步骤)
5. [运行时自愈与监控](#5-运行时自愈与监控)
6. [OTA 升级](#6-ota-升级)
7. [常见问题排查](#7-常见问题排查)
8. [校验与验证报告](#8-校验与验证报告)

---

## 1. 概述

NAISys ISO 基于官方 Debian 13 netinst 镜像重打包，核心改造：

| 能力 | 实现方式 |
|------|----------|
| 零交互安装 | 嵌入式 preseed + `auto=true priority=critical` 启动参数 |
| 网卡驱动 | 固件构建期注入 initrd（安装阶段即有网络） |
| 混合启动 | xorriso 生成 UEFI（El Torito EFI）+ Legacy（isolinux）双启动 |
| 预装软件 | tailscale / docker-ce / curl / jq 等安装即可用 |
| 运行时自愈 | systemd 单元 + drop-in 保证开机自启与崩溃重启 |
| OTA 升级 | 定时从 GitHub Releases 拉取、校验、原地升级 |

**安装产物布局**（与 AGENTS.md 第 5 节数据目录规范一致）：

```
/                       # 系统分区（ext4，限定上限）
/data/                  # 数据分区（XFS/Btrfs，占用全部剩余空间）
├── naisys/             # AI 系统应用目录
│   ├── secrets/        # 密钥（0700）
│   ├── cache/
│   └── alerts/         # data-guard 告警日志
└── {uid}/              # 用户数据（运行时创建）
/opt/naisys/            # 应用运行时（后端 + Web 控制台 + 脚本）
/etc/naisys.env         # 运行时环境变量（含首启生成的 API token）
```

---

## 2. 集成驱动列表

构建期通过 `apt-get download` 拉取固件包，解包后合并进 initrd 的 `lib/firmware/`。

| 网卡 | 芯片/驱动 | 固件包 | 说明 |
|------|-----------|--------|------|
| Realtek RTL8125 / RTL8156 (2.5G) | r8125 / r8169 | `firmware-realtek` | 消费级主板板载 2.5G 网口 |
| Intel i225 / i226 (2.5G) | igc | 内核自带 | 无需额外固件，驱动已内置 |
| Mellanox ConnectX-3 | mlx4 | `firmware-misc-nonfree` | 企业级万兆网卡 |
| Mellanox ConnectX-4 | mlx5 | `firmware-misc-nonfree` | 企业级万兆网卡 |
| 通用兜底 | — | `firmware-linux-nonfree` | 其他常见网卡/芯片固件 |

> 固件包清单见 `iso/config.env` 的 `FIRMWARE_PACKAGES`，可按需扩展。
> 校验注入结果：`verify-iso.sh` 会统计 initrd 内 `lib/firmware` 文件数。

---

## 3. ISO 构建

### 3.1 自动构建（推荐）

GitHub Actions 每周六凌晨 2:00（北京时间）自动构建，也支持手动触发：

- 仓库 → **Actions** → **Build ISO** → **Run workflow**
- 可选参数：
  - `version`：版本号（留空用 `<run_id>-weekly`）
  - `data_fstype`：`/data` 文件系统（`xfs` 默认 / `btrfs`）

构建产物自动上传至 **GitHub Releases**，tag 形如 `iso-<version>`，含：

- `naisys-<version>-amd64.iso`（混合 ISO）
- `naisys-<version>-amd64.iso.sha256`（校验和）
- `naisys-<version>-amd64-verification-report.md`（验证报告）
- `naisys-runtime.tar.gz` + `.sha256`（应用运行时，供 OTA）

### 3.2 本地手动构建

```bash
cd iso
sudo ./build-iso.sh                 # 需 root
./verify-iso.sh out/naisys-*.iso    # 校验 + 生成报告
```

可调环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `NAISYS_HOSTNAME` | `ai-nas` | 默认主机名 |
| `NAISYS_USERNAME` | `admin` | 默认用户 |
| `NAISYS_DATA_FSTYPE` | `xfs` | /data 文件系统 |
| `NAISYS_SYS_SIZE_MB` | `30000` | 系统分区上限（MB） |
| `NAISYS_INIT_PASSWORD` | 随机 | 初始密码（不设置则随机生成） |
| `DEBIAN_MIRROR` | 官方 | netinst 下载源（内网可覆盖） |

> ⚠️ 初始密码绝不硬编码。未指定时构建期随机生成，烘焙进安装介质，
> 首启引导页显示，**用户须立即在 Web 控制台修改**。

---

## 4. 安装步骤

### 4.1 准备工作

1. 从 GitHub Releases 下载最新 `naisys-*.iso` 与 `.sha256`。
2. 校验完整性：
   ```bash
   sha256sum -c naisys-*.iso.sha256
   ```
3. 制作启动盘：
   ```bash
   # Linux / macOS
   sudo dd if=naisys-*.iso of=/dev/sdX bs=4M status=progress oflag=sync
   ```
   或使用 Rufus（Windows，选 DD 模式）。

### 4.2 安装流程（全自动）

```
┌─────────────────────────────────────────────────┐
│  1. 从 U 盘启动（UEFI 或 Legacy 均可）            │
│  2. 启动菜单默认选中 "Install NAISys (automated)" │
│     —— 5 秒倒计时后自动进入，无需按键            │
│  3. 显示安装进度条（全程无命令行、无选项）        │
│     · 自动检测第一块硬盘                         │
│     · 全盘格式化                                 │
│     · 创建 /data 分区 + 系统分区                 │
│     · 安装系统与预装软件                         │
│     · 部署 NAISys 运行时与 systemd 单元          │
│  4. 安装完成自动重启                             │
│  5. 重启后进入 Web 控制台引导页                  │
└─────────────────────────────────────────────────┘
```

> 截图占位：CI 无图形环境，安装进度条截图请在真机/虚拟机验证后补充至
> `docs/assets/install-progress.png`，并在此处引用。`[NEEDS REVIEW]`

### 4.3 首次访问 Web 控制台

重启后，首启服务 `naisys-firstboot.service` 会：

1. 生成 API token 写入 `/etc/naisys.env`
2. 探测局域网 / Tailscale 地址
3. 写入 `/data/naisys/firstboot-info.json`

访问地址（局域网内任一设备浏览器）：

```
http://<设备IP>:3000
```

设备 IP 可通过路由器后台或 `nmap -sn 192.168.1.0/24` 发现，主机名为 `ai-nas`。

**默认凭据**：

| 项 | 值 |
|----|----|
| 用户名 | `admin` |
| 初始密码 | 安装介质显示 / 构建产物 `.init-password` |

> 🔴 **首次登录后必须立即修改密码。**

---

## 5. 运行时自愈与监控

### 5.1 systemd 服务清单

| 单元 | 类型 | 作用 |
|------|------|------|
| `naisys-web-console.service` | service | Web 控制台（后端+前端），崩溃自动重启 |
| `naisys-firstboot.service` | oneshot | 首次启动引导（仅运行一次） |
| `naisys-data-guard.service` + `.timer` | timer | 每 30 分钟检测 /data 完整性 |
| `naisys-ota.service` + `.timer` | timer | 每 6 小时检查 OTA 升级 |
| `docker.service.d/override.conf` | drop-in | Docker 崩溃自愈 + 开机自启 |
| `tailscaled.service.d/override.conf` | drop-in | Tailscale 崩溃自愈 + 开机自启 |

`naisys-web-console.service` 以专用低权限用户 `naisys` 运行（遵守 AGENTS.md
4.2 红线：禁止 root 运行用户态服务），并启用 `NoNewPrivileges` /
`ProtectSystem` / `PrivateTmp` 等安全加固。

### 5.2 /data 完整性检测

`data-guard.sh` 每次检测：

- `/data` 是否已挂载
- 是否可写（检测只读文件系统）
- 关键子目录（`naisys/`）是否存在
- 磁盘 SMART 健康状态（若 `smartctl` 可用）

异常时写入 `/data/naisys/alerts/data-guard.log` 并通过 `logger` 记录到系统日志。

查看状态：

```bash
systemctl status naisys-data-guard.timer
systemctl list-timers | grep naisys
journalctl -u naisys-data-guard.service -n 50
cat /data/naisys/alerts/data-guard.log
```

---

## 6. OTA 升级

OTA 升级的是**应用运行时**（后端 + Web 控制台），而非整机 ISO 重装——
无人值守下重装整机会破坏 `/data`，故整机升级需用户主动用新 ISO 引导。

流程（`ota-upgrade.sh`）：

```
查询 GitHub 最新 Release
   ↓ 比对 /opt/naisys/VERSION
版本不同 → 下载 naisys-runtime.tar.gz
   ↓ 校验 SHA256（无校验文件则拒绝升级）
通过 → 备份旧版 → 解包新版 → 重启 web-console
失败 → 自动回滚到备份
```

手动触发：

```bash
sudo systemctl start naisys-ota.service
journalctl -u naisys-ota.service -f
```

---

## 7. 常见问题排查

### Q1: 安装时找不到硬盘 / 未自动选择
- 确认硬盘已正确连接并在 BIOS 中识别。
- preseed 使用 `list-devices disk | head -n1` 选第一块盘；多盘环境会选
  内核枚举的第一个设备。如需指定，编辑 preseed 的 `partman/early_command`。

### Q2: 安装阶段无网络（网卡未识别）
- 确认网卡型号在[驱动列表](#2-集成驱动列表)内。
- 检查 initrd 固件注入：`./verify-iso.sh` 报告的"固件文件数"应 > 0。
- 极新网卡可能需更新固件包，编辑 `iso/config.env` 的 `FIRMWARE_PACKAGES`。

### Q3: UEFI 无法启动 / 只看到 Legacy
- 确认启动盘用 DD 模式写入（非解压复制）。
- 混合 ISO 同时含 `isolinux`（Legacy）与 `boot/grub/efi.img`（UEFI）。
- 关闭 BIOS 的 Secure Boot（当前未签名）。

### Q4: 安装后无法访问 Web 控制台
```bash
systemctl status naisys-web-console.service   # 服务状态
journalctl -u naisys-web-console -n 50        # 日志
cat /data/naisys/firstboot-info.json          # 引导地址
ss -tlnp | grep 3000                          # 端口监听
```
- 确认 `/etc/naisys.env` 中 `NAISYS_HOST=0.0.0.0`（默认仅本地需改）。
- 防火墙放行 3000 端口。

### Q5: 忘记初始密码
- 构建产物目录的 `.init-password` 文件记录了构建期生成的密码。
- 若丢失，可挂载系统分区重置 `/etc/naisys.env` 或 chroot 重置用户密码。

### Q6: OTA 升级失败
```bash
journalctl -u naisys-ota.service -n 100
ls /opt/naisys/app.bak.*        # 自动备份，可手动回滚
```
- 离线环境 OTA 会跳过（无法访问 GitHub Releases），属正常。

---

## 8. 校验与验证报告

每次构建自动生成：

1. **SHA256 校验和**：`naisys-*.iso.sha256`
   ```bash
   sha256sum -c naisys-*.iso.sha256
   ```
2. **安装验证报告**：`naisys-*-verification-report.md`，含：
   - 完整性校验结果
   - ISO 结构检查（preseed / vmlinuz / initrd 是否齐全）
   - 网卡固件注入统计
   - 安装验证清单（人工勾选）

报告由 `iso/verify-iso.sh` 生成，CI 中在构建后自动执行并随 Release 发布。

---

## 附录：文件索引

| 文件 | 作用 |
|------|------|
| `.github/workflows/build-iso.yml` | 构建流水线（定时+手动） |
| `iso/build-iso.sh` | 主构建脚本 |
| `iso/verify-iso.sh` | 校验与报告 |
| `iso/config.env` | 构建参数 |
| `iso/preseed/preseed.template.cfg` | 无人值守安装模板 |
| `iso/boot/*.cfg` | 启动菜单（Legacy + UEFI） |
| `iso/packages/runtime-packages.txt` | 预装包清单 |
| `iso/runtime/*.sh` | 运行时脚本（部署/首启/检测/OTA） |
| `iso/systemd/*` | systemd 服务单元 |