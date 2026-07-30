#!/usr/bin/env bash
# ============================================================================
# build-offline-repo.sh — 构建离线 apt 仓库
# 在构建环境（联网）下载 Vibe OS 运行时所需的全部 .deb 及其递归依赖，
# 用 dpkg-scanpackages 生成 Packages 索引，打包进 ISO。
# 安装期（可能完全离线）即可从本地 file:// 仓库安装全部软件。
#
# 用法：sudo ./build-offline-repo.sh <输出目录>
# 依赖：apt, dpkg-dev(提供 dpkg-scanpackages), curl, gnupg, ca-certificates
# ============================================================================
set -euo pipefail

OUT_REPO="${1:-}"
[[ -n "$OUT_REPO" ]] || { echo "用法: $0 <输出目录>" >&2; exit 1; }

ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
DEB_DIR="${OUT_REPO}/debs"

log() { printf '[offline-repo] %s\n' "$*"; }
die() { printf '[offline-repo][ERROR] %s\n' "$*" >&2; exit 1; }

# ----------------------------------------------------------------------------
# 1. 配置第三方软件源（docker-ce / tailscale / nodejs）及签名密钥
# ----------------------------------------------------------------------------
setup_sources() {
  log "配置第三方软件源 (arch=$ARCH, codename=$CODENAME)"
  install -m 0755 -d /etc/apt/keyrings

  # --- Docker CE ---
  log "  Docker CE 源"
  curl -fsSL https://download.docker.com/linux/debian/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker-offline-build.list

  # --- Tailscale ---
  log "  Tailscale 源"
  curl -fsSL "https://pkgs.tailscale.com/stable/debian/${CODENAME}.noarmor.gpg" \
    -o /etc/apt/keyrings/tailscale-archive-keyring.gpg
  curl -fsSL "https://pkgs.tailscale.com/stable/debian/${CODENAME}.tailscale-keyring.list" \
    -o /etc/apt/sources.list.d/tailscale-offline-build.list

  # --- Node.js (NodeSource 22.x) ---
  log "  NodeSource 源"
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] \
https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource-offline-build.list

  apt-get update -qq
}

# ----------------------------------------------------------------------------
# 2. 递归收集依赖并下载全部 .deb
# ----------------------------------------------------------------------------
TARGET_PACKAGES=(
  # 基础工具
  curl jq ca-certificates gnupg lsb-release software-properties-common
  # 容器运行时
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  # 组网
  tailscale
  # 运行时
  nodejs
  # 文件系统与监控
  xfsprogs btrfs-progs smartmontools
)

download_packages() {
  mkdir -p "$DEB_DIR"
  log "递归解析依赖树"

  # apt-cache depends --recurse 列出全部递归依赖；
  # 过滤掉虚拟包（<...>）与非包行，得到真实包名集合
  local all_pkgs
  all_pkgs="$(
    apt-cache depends --recurse --no-recommends --no-suggests \
      --no-conflicts --no-breaks --no-replaces --no-enhances \
      "${TARGET_PACKAGES[@]}" 2>/dev/null \
    | grep -E '^\w' \
    | sort -u
  )"
  local count
  count="$(echo "$all_pkgs" | wc -l)"
  log "依赖树共 $count 个包，开始下载"

  # 逐包下载：apt-get download 多包时若有一个不可定位会整批失败，
  # 故逐个下载以隔离失败（部分包可能是虚拟包/已内置/被替代）。
  local pkg
  (
    cd "$DEB_DIR"
    while IFS= read -r pkg; do
      [[ -n "$pkg" ]] || continue
      apt-get download "$pkg" >/dev/null 2>&1 || {
        log "  跳过不可下载包: $pkg"
      }
    done <<< "$all_pkgs"
  )

  local deb_count
  deb_count="$(find "$DEB_DIR" -name '*.deb' | wc -l)"
  log "已下载 $deb_count 个 .deb 文件"
  [[ "$deb_count" -gt 0 ]] || die "未下载到任何 .deb，请检查网络与软件源"
}

# ----------------------------------------------------------------------------
# 3. 生成 apt 仓库索引
# ----------------------------------------------------------------------------
gen_index() {
  log "生成 Packages 索引 (dpkg-scanpackages)"
  command -v dpkg-scanpackages >/dev/null 2>&1 \
    || die "缺少 dpkg-scanpackages，请安装 dpkg-dev"
  (
    cd "$OUT_REPO"
    dpkg-scanpackages --multiversion debs /dev/null > Packages
    gzip -9c Packages > Packages.gz
  )
  log "索引生成完成: $(wc -l < "${OUT_REPO}/Packages") 行"
}

# ----------------------------------------------------------------------------
# 4. 生成安装期使用的离线源配置
# ----------------------------------------------------------------------------
gen_source_config() {
  log "生成离线源配置 vibeos-offline.list"
  # 安装期此文件被复制到 /etc/apt/sources.list.d/，
  # 路径指向安装介质挂载点下的离线仓库（见 install-runtime.sh）
  cat > "${OUT_REPO}/vibeos-offline.list" <<'EOF'
# Vibe OS 离线软件仓库（安装期由 install-runtime.sh 自动配置）
# 占位符 __REPO_PATH__ 由安装脚本替换为实际挂载路径
deb [trusted=yes] file:__REPO_PATH__ ./
EOF
}

main() {
  log "开始构建离线仓库 → $OUT_REPO"
  rm -rf "$OUT_REPO"
  setup_sources
  download_packages
  gen_index
  gen_source_config
  log "离线仓库构建完成 ✅ ($(du -sh "$OUT_REPO" | cut -f1))"
}

main "$@"