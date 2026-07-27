#!/usr/bin/env bash
# ============================================================================
# data-guard.sh — /data 目录完整性检测
# 由 naisys-data-guard.timer 定时触发
# 检测项：挂载状态、关键子目录存在性、文件系统只读、SMART 健康
# 异常时写入告警文件并通过 logger 记录（可对接 Web 控制台告警 API）
# ============================================================================
set -euo pipefail

DATA_ROOT="${NAISYS_DATA_ROOT:-/data}"
ALERT_FILE="/data/naisys/alerts/data-guard.log"
REQUIRED_DIRS=(naisys)
EXIT_CODE=0

log()  { printf '[data-guard] %s\n' "$*"; }
alert() {
  log "告警: $*"
  mkdir -p "$(dirname "$ALERT_FILE")" 2>/dev/null || true
  echo "$(date -Iseconds) [ALERT] $*" >> "$ALERT_FILE" 2>/dev/null || true
  logger -t naisys-data-guard "ALERT: $*" 2>/dev/null || true
  EXIT_CODE=1
}

check_mounted() {
  if ! mountpoint -q "$DATA_ROOT"; then
    alert "$DATA_ROOT 未挂载"
    return 1
  fi
  log "$DATA_ROOT 已挂载"
}

check_writable() {
  local probe="${DATA_ROOT}/.write-probe.$$"
  if ! touch "$probe" 2>/dev/null; then
    alert "$DATA_ROOT 不可写（可能为只读文件系统）"
    return 1
  fi
  rm -f "$probe"
  log "$DATA_ROOT 可写"
}

check_dirs() {
  for d in "${REQUIRED_DIRS[@]}"; do
    if [[ ! -d "${DATA_ROOT}/${d}" ]]; then
      alert "关键目录缺失: ${DATA_ROOT}/${d}"
    else
      log "目录正常: ${DATA_ROOT}/${d}"
    fi
  done
}

check_smart() {
  command -v smartctl >/dev/null 2>&1 || { log "smartctl 不可用，跳过 SMART 检测"; return 0; }
  local disk
  disk="$(findmnt -n -o SOURCE "$DATA_ROOT" 2>/dev/null | sed 's/[0-9]*$//;s/p$//')"
  [[ -n "$disk" ]] || { log "无法确定 $DATA_ROOT 所在磁盘，跳过 SMART"; return 0; }
  if smartctl -H "$disk" 2>/dev/null | grep -q "FAILED"; then
    alert "磁盘 SMART 健康检测失败: $disk"
  else
    log "磁盘 SMART 正常: $disk"
  fi
}

main() {
  log "开始 /data 完整性检测"
  if check_mounted; then
    check_writable
    check_dirs
    check_smart
  fi
  if [[ $EXIT_CODE -eq 0 ]]; then
    log "检测通过，/data 状态健康 ✅"
  else
    log "检测发现异常，详见 $ALERT_FILE ❌"
  fi
  exit $EXIT_CODE
}

main "$@"