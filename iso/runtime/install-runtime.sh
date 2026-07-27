#!/usr/bin/env bash
# ============================================================================
# install-runtime.sh — 安装后部署 NAISys 运行时
# 由 preseed late_command 在目标系统（/target）内调用
# 职责：安装预装软件、部署后端+Web控制台、安装 systemd 单元、启用服务
# ============================================================================
set -euo pipefail

log() { printf '[install-runtime] %s\n' "$*"; }

# 判断是否在目标系统内运行（late_command 用 in-target，此处直接操作 /）
APP_DIR="/opt/naisys"
SYSTEMD_SRC="${APP_DIR}/systemd"

install_packages() {
  log "安装预装软件包"
  local pkgs_file="${APP_DIR}/runtime-packages.txt"
  [[ -f "$pkgs_file" ]] || { log "包清单缺失，跳过"; return 0; }

  # 过滤注释与空行
  local pkgs
  pkgs="$(grep -vE '^\s*(#|$)' "$pkgs_file" | tr '\n' ' ')"

  # docker-ce / tailscale 需要官方源；离线环境降级为发行版自带包
  if apt-get update -qq 2>/dev/null; then
    install_docker_repo || true
    install_tailscale_repo || true
    apt-get update -qq || true
    # shellcheck disable=SC2086
    apt-get install -y --no-install-recommends $pkgs || {
      log "警告: 部分包安装失败，尝试降级安装核心包"
      apt-get install -y --no-install-recommends curl jq ca-certificates xfsprogs btrfs-progs || true
    }
  else
    log "警告: 无网络，跳过软件包安装（离线环境由 ISO 内嵌或后续 OTA 补齐）"
  fi
}

install_docker_repo() {
  log "配置 Docker CE 官方源"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
}

install_tailscale_repo() {
  log "配置 Tailscale 官方源"
  # [修复] 使用实际发行版代号，避免写死 bookworm 导致 trixie 上源冲突
  local codename
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  curl -fsSL "https://pkgs.tailscale.com/stable/debian/${codename}.noarmor.gpg" \
    -o /etc/apt/keyrings/tailscale-archive-keyring.gpg 2>/dev/null || true
  curl -fsSL "https://pkgs.tailscale.com/stable/debian/${codename}.tailscale-keyring.list" \
    -o /etc/apt/sources.list.d/tailscale.list 2>/dev/null || true
}

deploy_app() {
  log "部署应用运行时"

  # 创建专用低权限用户（AGENTS.md 4.2 红线：禁止 root 运行用户态服务）
  if ! id naisys >/dev/null 2>&1; then
    useradd --system --home-dir /opt/naisys --shell /usr/sbin/nologin \
      --comment "NAISys service user" naisys
    log "已创建系统用户 naisys"
  fi

  mkdir -p /data/naisys/{models,data,logs,secrets,cache}
  chmod 700 /data/naisys/secrets
  # 应用与数据目录归属 naisys 用户
  chown -R naisys:naisys /data/naisys 2>/dev/null || true

  if [[ -d "${APP_DIR}/app" ]]; then
    log "检测到内嵌应用包，安装到 /opt/naisys/app"
    chown -R naisys:naisys "${APP_DIR}/app" 2>/dev/null || true
    # 应用包由 CI 构建期打入，含 dist/ 与 web-dist/
  else
    log "无内嵌应用包，Web 控制台将由 OTA 或手动部署"
  fi

  # 生成运行时环境变量文件（不含敏感信息，token 首启生成）
  cat > /etc/naisys.env <<'EOF'
NAISYS_DATA_ROOT=/data
NAISYS_PORT=3000
NAISYS_HOST=0.0.0.0
NAISYS_CMD_TIMEOUT=30000
EOF
  chmod 644 /etc/naisys.env
}

install_systemd_units() {
  log "安装 systemd 单元"
  [[ -d "$SYSTEMD_SRC" ]] || { log "systemd 目录缺失，跳过"; return 0; }

  cp -f "${SYSTEMD_SRC}"/naisys-*.service /etc/systemd/system/ 2>/dev/null || true
  cp -f "${SYSTEMD_SRC}"/naisys-*.timer /etc/systemd/system/ 2>/dev/null || true

  # drop-in 覆盖（确保 docker/tailscaled 崩溃自愈）
  mkdir -p /etc/systemd/system/docker.service.d
  mkdir -p /etc/systemd/system/tailscaled.service.d
  cp -f "${SYSTEMD_SRC}/docker.service.d/override.conf" \
    /etc/systemd/system/docker.service.d/ 2>/dev/null || true
  cp -f "${SYSTEMD_SRC}/tailscaled.service.d/override.conf" \
    /etc/systemd/system/tailscaled.service.d/ 2>/dev/null || true

  systemctl daemon-reload
  systemctl enable naisys-web-console.service naisys-firstboot.service \
    naisys-data-guard.timer naisys-ota.timer 2>/dev/null || true
  log "systemd 单元安装并启用完成"
}

main() {
  log "开始部署 NAISys 运行时"
  install_packages
  deploy_app
  install_systemd_units
  log "运行时部署完成 ✅"
}

main "$@"