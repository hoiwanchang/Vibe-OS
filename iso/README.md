# NAISys ISO 构建目录

本目录包含 NAISys 安装镜像（Debian 13 Trixie amd64）的全部构建资产，
由 `.github/workflows/build-iso.yml` 在 CI 中调用，也可本地手动执行。

## 目录结构

```
iso/
├── README.md                     # 本文件
├── build-iso.sh                  # 主构建脚本（initrd 驱动注入 + xorriso 混合 ISO）
├── verify-iso.sh                 # 校验脚本（SHA256 + 安装验证报告）
├── config.env                    # 构建参数（Debian 版本、镜像 URL、固件包列表）
├── preseed/
│   └── preseed.template.cfg      # 无人值守安装模板（envsubst 占位符）
├── boot/
│   ├── isolinux-append.fragment  # Legacy BIOS 自动安装启动参数
│   └── grub-autoinstall.cfg      # UEFI 自动安装菜单项
├── packages/
│   └── runtime-packages.txt      # live/安装环境预装包清单
├── runtime/
│   ├── install-runtime.sh        # 安装后部署后端+Web控制台+systemd 单元
│   ├── firstboot.sh              # 首启引导（生成密码、显示控制台地址）
│   ├── data-guard.sh             # /data 目录完整性检测
│   └── ota-upgrade.sh            # OTA 升级（拉取 Release 校验并原地升级）
└── systemd/
    ├── naisys-web-console.service
    ├── naisys-firstboot.service
    ├── naisys-data-guard.service
    ├── naisys-data-guard.timer
    ├── naisys-ota.service
    ├── naisys-ota.timer
    ├── docker.service.d/override.conf
    └── tailscaled.service.d/override.conf
```

## 设计要点

1. **零交互安装**：基于 Debian netinst + 嵌入式 preseed，启动即自动安装，
   全程无命令行、无分区选择，进度条可视化，目标 5 分钟内完成。
2. **驱动烘焙进 initrd**：消费级网卡固件（RTL8125/8156、Intel i225/i226、
   Mellanox ConnectX-3/4）在构建期注入 initrd，确保安装阶段即有网络。
3. **混合 ISO**：xorriso 生成同时支持 UEFI（El Torito EFI）与 Legacy BIOS
   （isolinux）的可启动镜像。
4. **运行时自愈**：systemd 单元保证 Docker / Tailscale / Web Console 开机自启
   与崩溃重启；data-guard 定时校验 /data 完整性；ota 定时拉取新版本。

## 本地手动构建

```bash
cd iso
sudo ./build-iso.sh            # 需要 root（chroot/mount 操作）
./verify-iso.sh out/naisys-*.iso
```

> 注意：构建需联网下载 Debian netinst 与固件包。CI 环境已配置好全部依赖。