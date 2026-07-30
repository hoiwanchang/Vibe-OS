#!/usr/bin/env bash
# ============================================================================
# install-runtime.sh — 安装后部署 Vibe OS 运行时（离线优先）
# 由 preseed late_command 在目标系统（/target）内调用
# 职责：从 ISO 内嵌离线仓库安装全部软件、部署后端+Web控制台、装 systemd 单元
#
# 离线设计：所有 .deb 及依赖已在构建期打入 ISO 的 offline-repo/，
#          安装期无需任何外网即可装全 docker/tailscale/nodejs/工具。
# ============================================================================
set -euo pipefail

log() { printf '[install-runtime] %s\n' "$*"; }

APP_DIR="/opt/vibeos"
SYSTEMD_SRC="${APP_DIR}/systemd"
OFFLINE_REPO="${APP_DIR}/offline-repo"
OFFLINE_LIST="/etc/apt/sources.list.d/vibeos-offline.list"

# ----------------------------------------------------------------------------
# 1. 配置本地离线仓库并安装全部软件包
# ----------------------------------------------------------------------------
install_packages() {
  log "配置离线软件仓库"

  if [[ ! -d "$OFFLINE_REPO" || ! -f "${OFFLINE_REPO}/Packages" ]]; then
    log "警告: 未找到离线仓库 $OFFLINE_REPO，尝试联网安装（可能失败）"
    install_packages_online
    return
  fi

  # 指向 ISO 内嵌仓库的本地源（trusted=yes 跳过签名校验，仓库随介质分发）
  echo "deb [trusted=yes] file:${OFFLINE_REPO} ./" > "$OFFLINE_LIST"

  # 临时禁用其他源，避免离线环境下 apt update 因外网源失败
  local disabled=()
  local f
  for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.list \
           /etc/apt/sources.list.d/*.sources; do
    [[ -f "$f" && "$f" != "$OFFLINE_LIST" ]] || continue
    mv "$f" "${f}.vibeos-bak"
    disabled+=("$f")
  done

  log "从离线仓库安装全部软件包"
  if apt-get update -o Dir::Etc::sourcelist="$OFFLINE_LIST" \
       -o Dir::Etc::sourceparts=/dev/null -o APT::Get::List-Cleanup=0 -qq; then
    # 从包清单读取目标包（过滤注释/空行）
    local pkgs
    pkgs="$(grep -vE '^\s*(#|$)' "${APP_DIR}/runtime-packages.txt" 2>/dev/null | tr '\n' ' ')"
    # shellcheck disable=SC2086
    if apt-get install -y --no-install-recommends \
         -o Dir::Etc::sourcelist="$OFFLINE_LIST" \
         -o Dir::Etc::sourceparts=/dev/null \
         -o APT::Get::List-Cleanup=0 $pkgs; then
      log "离线安装完成 ✅"
    else
      log "警告: 离线安装部分失败，尝试降级安装核心包"
      apt-get install -y --no-install-recommends \
        -o Dir::Etc::sourcelist="$OFFLINE_LIST" \
        -o Dir::Etc::sourceparts=/dev/null \
        curl jq ca-certificates xfsprogs btrfs-progs || true
    fi
  else
    log "警告: 离线仓库索引加载失败"
  fi

  # 恢复被禁用的源（安装完成后系统可正常联网更新）
  for f in "${disabled[@]}"; do
    mv "${f}.vibeos-bak" "$f"
  done
  rm -f "$OFFLINE_LIST"
}

# 降级路径：无离线仓库时尝试联网安装（保留向后兼容）
install_packages_online() {
  log "尝试联网安装（降级路径）"
  if apt-get update -qq 2>/dev/null; then
    local pkgs
    pkgs="$(grep -vE '^\s*(#|$)' "${APP_DIR}/runtime-packages.txt" 2>/dev/null | tr '\n' ' ')"
    # shellcheck disable=SC2086
    apt-get install -y --no-install-recommends $pkgs || {
      log "警告: 联网安装失败，核心功能可能缺失"
      apt-get install -y --no-install-recommends curl jq ca-certificates || true
    }
  else
    log "警告: 无网络且无离线仓库，跳过软件包安装"
  fi
}

# ----------------------------------------------------------------------------
# 2. 部署应用运行时
# ----------------------------------------------------------------------------
deploy_app() {
  log "部署应用运行时"

  # 创建专用低权限用户（AGENTS.md 4.2 红线：禁止 root 运行用户态服务）
  if ! id vibeos >/dev/null 2>&1; then
    useradd --system --home-dir /opt/vibeos --shell /usr/sbin/nologin \
      --comment "Vibe OS service user" vibeos
    log "已创建系统用户 vibeos"
  fi

  mkdir -p /data/vibeos/{models,data,logs,secrets,cache}
  chmod 700 /data/vibeos/secrets
  chown -R vibeos:vibeos /data/vibeos 2>/dev/null || true

  if [[ -d "${APP_DIR}/app" ]]; then
    log "检测到内嵌应用包，安装到 /opt/vibeos/app"
    chown -R vibeos:vibeos "${APP_DIR}/app" 2>/dev/null || true
  else
    log "无内嵌应用包，Web 控制台将由 OTA 或手动部署"
  fi

  # 生成运行时环境变量文件（不含敏感信息，token 首启生成）
  cat > /etc/vibeos.env <<'EOF'
VIBEOS_DATA_ROOT=/data
VIBEOS_PORT=3000
VIBEOS_HOST=0.0.0.0
VIBEOS_CMD_TIMEOUT=30000
EOF
  chmod 644 /etc/vibeos.env
}

# ----------------------------------------------------------------------------
# 3. 安装 systemd 单元
# ----------------------------------------------------------------------------
install_systemd_units() {
  log "安装 systemd 单元"
  [[ -d "$SYSTEMD_SRC" ]] || { log "systemd 目录缺失，跳过"; return 0; }

  cp -f "${SYSTEMD_SRC}"/vibeos-*.service /etc/systemd/system/ 2>/dev/null || true
  cp -f "${SYSTEMD_SRC}"/vibeos-*.timer /etc/systemd/system/ 2>/dev/null || true

  mkdir -p /etc/systemd/system/docker.service.d
  mkdir -p /etc/systemd/system/tailscaled.service.d
  cp -f "${SYSTEMD_SRC}/docker.service.d/override.conf" \
    /etc/systemd/system/docker.service.d/ 2>/dev/null || true
  cp -f "${SYSTEMD_SRC}/tailscaled.service.d/override.conf" \
    /etc/systemd/system/tailscaled.service.d/ 2>/dev/null || true

  systemctl daemon-reload
  systemctl enable vibeos-web-console.service vibeos-firstboot.service \
    vibeos-data-guard.timer vibeos-ota.timer 2>/dev/null || true
  log "systemd 单元安装并启用完成"
}

main() {
  log "开始部署 Vibe OS 运行时（离线优先）"
  install_packages
  deploy_app
  install_systemd_units
  log "运行时部署完成 ✅"
}

main "$@"