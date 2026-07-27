#!/usr/bin/env bash
# ============================================================================
# NAISys ISO 构建脚本
# 功能：下载 Debian netinst → 注入网卡固件到 initrd → 嵌入 preseed 与运行时
#       → 改造启动菜单 → xorriso 重打包混合 ISO（UEFI + Legacy BIOS）
# 用法：sudo ./build-iso.sh
# 依赖：xorriso, curl, cpio, gzip/zstd, dpkg-deb, envsubst(gettext), file
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=iso/config.env
source "${SCRIPT_DIR}/config.env"

# --- 可调参数（环境变量覆盖）---
HOSTNAME="${NAISYS_HOSTNAME:-$DEFAULT_HOSTNAME}"
USERNAME="${NAISYS_USERNAME:-$DEFAULT_USER}"
DATA_FSTYPE="${NAISYS_DATA_FSTYPE:-$DEFAULT_DATA_FSTYPE}"
SYS_SIZE_MB="${NAISYS_SYS_SIZE_MB:-30000}"        # 系统分区上限 30GB，/data 自动占满剩余
VERSION="${NAISYS_VERSION:-$(date +%Y.%m.%d)-weekly}"

WORK_DIR="${SCRIPT_DIR}/work"
OUT_DIR="${SCRIPT_DIR}/out"
ISO_TREE="${WORK_DIR}/iso-tree"
INITRD_DIR="${WORK_DIR}/initrd"
FW_DIR="${WORK_DIR}/firmware"
RUNTIME_BUNDLE="${SCRIPT_DIR}/runtime-bundle"

log()  { printf '\033[1;34m[build-iso]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[build-iso][ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  [[ $EUID -eq 0 ]] || die "需要 root 权限（chroot/mount 操作），请使用 sudo 运行"
}

check_deps() {
  local missing=()
  for cmd in xorriso curl cpio dpkg-deb envsubst file; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  # 压缩工具至少有一个
  command -v gzip >/dev/null 2>&1 || missing+=("gzip")
  (( ${#missing[@]} == 0 )) || die "缺少依赖: ${missing[*]}"
  log "依赖检查通过"
}

# ----------------------------------------------------------------------------
# 1. 下载并校验 Debian netinst ISO
# ----------------------------------------------------------------------------
download_netinst() {
  mkdir -p "$WORK_DIR"
  local iso="${WORK_DIR}/debian-netinst.iso"
  if [[ -f "$iso" ]]; then
    log "netinst 已存在，跳过下载"
  else
    log "下载 netinst: $NETINST_URL"
    curl -fL --retry 3 -o "$iso" "$NETINST_URL"
  fi

  log "校验 netinst SHA256"
  curl -fsSL --retry 3 -o "${iso}.SHA256SUMS" "$NETINST_SHA_URL"
  local expected actual
  expected="$(grep "debian-${DEBIAN_VERSION}-${DEBIAN_ARCH}-netinst.iso" "${iso}.SHA256SUMS" | awk '{print $1}')"
  actual="$(sha256sum "$iso" | awk '{print $1}')"
  [[ "$expected" == "$actual" ]] || die "netinst SHA256 校验失败: 期望 $expected 实际 $actual"
  log "netinst 校验通过"
  NETINST_ISO="$iso"
}

# ----------------------------------------------------------------------------
# 2. 解包 ISO 到目录树
# ----------------------------------------------------------------------------
extract_iso() {
  rm -rf "$ISO_TREE"
  mkdir -p "$ISO_TREE"
  log "解包 ISO 到 $ISO_TREE"
  xorriso -osirrox on -indev "$NETINST_ISO" -extract / "$ISO_TREE" >/dev/null 2>&1
  chmod -R u+w "$ISO_TREE"
}

# ----------------------------------------------------------------------------
# 3. 下载固件包并注入 initrd
#    消费级网卡：RTL8125/8156, Intel i225/i226, Mellanox ConnectX-3/4
# ----------------------------------------------------------------------------
inject_firmware() {
  mkdir -p "$FW_DIR" "$INITRD_DIR"
  log "下载固件包: $FIRMWARE_PACKAGES"
  # apt-get download 会把 .deb 落到当前工作目录，故 cd 进专用目录
  local aptcache="${WORK_DIR}/apt-firmware"
  mkdir -p "$aptcache"
  apt-get update -qq
  (
    cd "$aptcache"
    for pkg in $FIRMWARE_PACKAGES; do
      apt-get download "$pkg" 2>/dev/null \
        || log "警告: 无法下载 $pkg（可能离线），跳过"
    done
  )

  # 解包每个 .deb 的 lib/firmware 内容
  local fwroot="${FW_DIR}/extracted"
  mkdir -p "$fwroot"
  local deb
  for deb in "$aptcache"/*.deb; do
    [[ -f "$deb" ]] || continue
    log "解包固件: $(basename "$deb")"
    dpkg-deb -x "$deb" "$fwroot" 2>/dev/null || true
  done

  # 定位 initrd（Debian 13 可能为 zstd 压缩）
  local initrd_src="${ISO_TREE}/install.amd/initrd.gz"
  [[ -f "$initrd_src" ]] || die "未找到 initrd: $initrd_src"

  log "解包 initrd 并注入固件"
  rm -rf "${INITRD_DIR:?}/"*
  (
    cd "$INITRD_DIR"
    case "$(file -b "$initrd_src")" in
      *Zstandard*) zstd -dc "$initrd_src" | cpio -idm --quiet ;;
      *gzip*)      gzip -dc "$initrd_src" | cpio -idm --quiet ;;
      *)           die "未知 initrd 压缩格式: $(file -b "$initrd_src")" ;;
    esac
  )

  # 合并固件到 initrd 的 lib/firmware
  if [[ -d "$fwroot/lib/firmware" ]]; then
    mkdir -p "${INITRD_DIR}/lib/firmware"
    cp -rn "$fwroot/lib/firmware/." "${INITRD_DIR}/lib/firmware/" || true
    log "固件已合并进 initrd"
  else
    log "警告: 未提取到任何固件文件"
  fi

  # 重新打包 initrd（保持与原始一致的压缩格式）
  log "重新打包 initrd"
  (
    cd "$INITRD_DIR"
    case "$(file -b "$initrd_src")" in
      *Zstandard*) find . | cpio -o -H newc --quiet | zstd -19 -T0 > "$initrd_src" ;;
      *)           find . | cpio -o -H newc --quiet | gzip -9 > "$initrd_src" ;;
    esac
  )
  log "initrd 固件注入完成"
}

# ----------------------------------------------------------------------------
# 4. 生成 preseed（envsubst 填充占位符）
# ----------------------------------------------------------------------------
generate_preseed() {
  log "生成 preseed 配置"
  # 初始密码：优先使用环境变量，否则随机生成（构建期烘焙，首启强制修改）
  local init_pw="${NAISYS_INIT_PASSWORD:-$(openssl rand -base64 12 2>/dev/null || head -c16 /dev/urandom | base64)}"
  # 生成 crypt 哈希（mkpasswd 若不可用则回退到 openssl）
  local pw_crypt root_crypt
  if command -v mkpasswd >/dev/null 2>&1; then
    pw_crypt="$(mkpasswd -m sha-512 "$init_pw")"
    root_crypt="$pw_crypt"
  else
    pw_crypt="$(openssl passwd -6 "$init_pw")"
    root_crypt="$pw_crypt"
  fi

  export HOSTNAME USERNAME DATA_FSTYPE SYS_SIZE_MB
  export PASSWORD_CRYPT="$pw_crypt" ROOT_PASSWORD_CRYPT="$root_crypt"

  mkdir -p "${ISO_TREE}/naisys"
  envsubst '${HOSTNAME} ${USERNAME} ${PASSWORD_CRYPT} ${ROOT_PASSWORD_CRYPT} ${DATA_FSTYPE} ${SYS_SIZE_MB}' \
    < "${SCRIPT_DIR}/preseed/preseed.template.cfg" \
    > "${ISO_TREE}/naisys/preseed.cfg"

  # 记录初始密码到构建产物（仅供首次引导显示，安装后应立即修改）
  printf '%s\n' "$init_pw" > "${OUT_DIR:-$WORK_DIR}/.init-password"
  chmod 600 "${OUT_DIR:-$WORK_DIR}/.init-password"
  log "preseed 生成完成（主机名=$HOSTNAME 用户=$USERNAME 数据分区=$DATA_FSTYPE）"
}

# ----------------------------------------------------------------------------
# 5. 复制运行时包（后端 + Web 控制台 + systemd 单元 + 脚本）
# ----------------------------------------------------------------------------
copy_runtime() {
  log "复制运行时资产到 ISO"
  local dest="${ISO_TREE}/naisys"
  mkdir -p "$dest"
  cp -r "${SCRIPT_DIR}/runtime/." "$dest/"
  cp -r "${SCRIPT_DIR}/systemd/." "$dest/systemd/"
  cp "${SCRIPT_DIR}/packages/runtime-packages.txt" "$dest/"
  # 若 CI 已构建出运行时 tarball，则一并嵌入
  if [[ -d "$RUNTIME_BUNDLE" ]]; then
    cp -r "$RUNTIME_BUNDLE/." "$dest/app/"
    log "已嵌入应用运行时包"
  else
    log "提示: 未发现 runtime-bundle/，将仅嵌入脚本（应用由 OTA 或手动部署）"
  fi
  chmod +x "$dest"/*.sh 2>/dev/null || true
}

# ----------------------------------------------------------------------------
# 6. 改造启动菜单（Legacy isolinux + UEFI grub）
# ----------------------------------------------------------------------------
patch_boot() {
  log "改造启动菜单"
  # Legacy BIOS: 替换 isolinux 默认配置
  if [[ -f "${ISO_TREE}/isolinux/txt.cfg" ]]; then
    cp "${SCRIPT_DIR}/boot/isolinux-append.fragment" "${ISO_TREE}/isolinux/txt.cfg"
  fi
  # 确保 isolinux.cfg 默认指向 install
  if [[ -f "${ISO_TREE}/isolinux/isolinux.cfg" ]]; then
    sed -i 's/^default.*/default install/' "${ISO_TREE}/isolinux/isolinux.cfg" || true
  fi
  # UEFI: 在 grub.cfg 顶部插入自动安装菜单
  local grub="${ISO_TREE}/boot/grub/grub.cfg"
  if [[ -f "$grub" ]]; then
    cat "${SCRIPT_DIR}/boot/grub-autoinstall.cfg" "$grub" > "${grub}.new"
    mv "${grub}.new" "$grub"
  fi
  log "启动菜单改造完成"
}

# ----------------------------------------------------------------------------
# 7. xorriso 重打包混合 ISO（UEFI + Legacy）
# ----------------------------------------------------------------------------
build_iso() {
  mkdir -p "$OUT_DIR"
  local out_name="${ISO_OUT_PATTERN//\{version\}/$VERSION}"
  local out_iso="${OUT_DIR}/${out_name}"
  log "生成混合 ISO: $out_iso"

  xorriso -as mkisofs \
    -r -J -joliet-long -l \
    -iso-level 3 \
    -V "$ISO_LABEL" \
    -partition_offset 16 \
    -isohybrid-mbr "${ISO_TREE}/isolinux/isohdpfx.bin" \
    -c isolinux/boot.cat \
    -b isolinux/isolinux.bin \
    -no-emul-boot -boot-load-size 4 -boot-info-table \
    -eltorito-alt-boot \
    -e boot/grub/efi.img \
    -no-emul-boot \
    -isohybrid-gpt-basdat \
    -o "$out_iso" \
    "$ISO_TREE"

  log "ISO 生成完成: $out_iso ($(du -h "$out_iso" | cut -f1))"
  OUT_ISO="$out_iso"
}

# ----------------------------------------------------------------------------
# 8. 生成校验和
# ----------------------------------------------------------------------------
checksum() {
  log "生成 SHA256 校验和"
  ( cd "$OUT_DIR" && sha256sum "$(basename "$OUT_ISO")" > "$(basename "$OUT_ISO").sha256" )
  cat "${OUT_DIR}/$(basename "$OUT_ISO").sha256"
}

cleanup() {
  log "清理工作目录"
  rm -rf "$WORK_DIR"
}

main() {
  log "NAISys ISO 构建开始 (version=$VERSION)"
  require_root
  check_deps
  download_netinst
  extract_iso
  inject_firmware
  generate_preseed
  copy_runtime
  patch_boot
  build_iso
  checksum
  cleanup
  log "全部完成 ✅  输出: $OUT_ISO"
}

main "$@"