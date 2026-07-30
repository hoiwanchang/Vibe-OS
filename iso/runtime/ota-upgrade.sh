#!/usr/bin/env bash
# ============================================================================
# ota-upgrade.sh — OTA 原地升级
# 由 vibeos-ota.timer 定时触发，或手动执行
# 流程：查询 GitHub 最新 Release → 比对版本 → 下载 → 校验 SHA256 → 原地升级
# 说明：此处升级的是 Vibe OS 应用运行时（后端+Web控制台），非整机 ISO 重装。
#       整机重装需用户主动用新 ISO 引导，避免无人值守下破坏 /data。
# ============================================================================
set -euo pipefail

source /etc/vibeos.env 2>/dev/null || true
GITHUB_REPO="${GITHUB_REPO:-Vibe OS/Vibe OS}"
API_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
CUR_VERSION_FILE="/opt/vibeos/VERSION"
STAGE_DIR="/data/vibeos/cache/ota"
LOCK_FILE="/var/run/vibeos-ota.lock"

log() { printf '[ota] %s\n' "$*"; }
die() { log "错误: $*"; exit 1; }

acquire_lock() {
  if [[ -f "$LOCK_FILE" ]] && kill -0 "$(cat "$LOCK_FILE" 2>/dev/null)" 2>/dev/null; then
    log "已有升级进程在运行，退出"
    exit 0
  fi
  echo $$ > "$LOCK_FILE"
  trap 'rm -f "$LOCK_FILE"' EXIT
}

current_version() {
  [[ -f "$CUR_VERSION_FILE" ]] && cat "$CUR_VERSION_FILE" || echo "unknown"
}

fetch_latest() {
  log "查询最新 Release: $API_URL"
  command -v jq >/dev/null 2>&1 || die "缺少 jq"
  local resp
  resp="$(curl -fsSL --retry 3 "$API_URL")" || die "无法访问 GitHub Releases（离线？）"
  LATEST_TAG="$(echo "$resp" | jq -r '.tag_name')"
  # 查找名为 vibeos-runtime-*.tar.gz 的资产
  ASSET_URL="$(echo "$resp" | jq -r '.assets[] | select(.name | test("vibeos-runtime.*\\.tar\\.gz$")) | .browser_download_url' | head -n1)"
  SHA_URL="$(echo "$resp" | jq -r '.assets[] | select(.name | test("vibeos-runtime.*\\.tar\\.gz\\.sha256$")) | .browser_download_url' | head -n1)"
  [[ -n "$ASSET_URL" && "$ASSET_URL" != "null" ]] || die "未找到运行时升级包资产"
  log "最新版本: $LATEST_TAG"
}

need_upgrade() {
  local cur
  cur="$(current_version)"
  if [[ "$cur" == "$LATEST_TAG" ]]; then
    log "当前版本 $cur 已是最新，无需升级"
    return 1
  fi
  log "当前版本 $cur → 目标版本 $LATEST_TAG"
  return 0
}

download_and_verify() {
  mkdir -p "$STAGE_DIR"
  local asset="${STAGE_DIR}/$(basename "$ASSET_URL")"
  log "下载升级包: $ASSET_URL"
  curl -fL --retry 3 -o "$asset" "$ASSET_URL" || die "下载失败"

  log "校验 SHA256"
  local expected actual
  if [[ -n "$SHA_URL" && "$SHA_URL" != "null" ]]; then
    expected="$(curl -fsSL "$SHA_URL" | awk '{print $1}')"
  else
    die "Release 未提供 SHA256 校验文件，拒绝升级（安全策略）"
  fi
  actual="$(sha256sum "$asset" | awk '{print $1}')"
  [[ "$expected" == "$actual" ]] || die "SHA256 校验失败: 期望 $expected 实际 $actual"
  log "校验通过"
  STAGED_ASSET="$asset"
}

apply_upgrade() {
  log "应用升级（原地替换 /opt/vibeos/app）"
  local backup="/opt/vibeos/app.bak.$(date +%s)"
  [[ -d /opt/vibeos/app ]] && mv /opt/vibeos/app "$backup"

  mkdir -p /opt/vibeos/app
  tar -xzf "$STAGED_ASSET" -C /opt/vibeos/app || {
    log "解包失败，回滚"
    rm -rf /opt/vibeos/app
    [[ -d "$backup" ]] && mv "$backup" /opt/vibeos/app
    die "升级失败已回滚"
  }

  echo "$LATEST_TAG" > "$CUR_VERSION_FILE"
  systemctl restart vibeos-web-console.service || log "警告: 服务重启失败"
  log "升级完成 ✅ 当前版本: $LATEST_TAG"
}

main() {
  acquire_lock
  fetch_latest
  if need_upgrade; then
    download_and_verify
    apply_upgrade
  fi
}

main "$@"