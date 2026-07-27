#!/usr/bin/env bash
# ============================================================================
# firstboot.sh — 首次启动引导
# 由 naisys-firstboot.service（Type=oneshot, ConditionPathExists）触发一次
# 职责：生成 API token、获取 Tailscale/局域网地址、输出引导信息、标记完成
# ============================================================================
set -euo pipefail

ENV_FILE="/etc/naisys.env"
SECRETS_DIR="/data/naisys/secrets"
DONE_FLAG="/var/lib/naisys/.firstboot-done"
CONSOLE_PORT="${NAISYS_PORT:-3000}"

log() { printf '[firstboot] %s\n' "$*"; }

main() {
  [[ -f "$DONE_FLAG" ]] && { log "首启已完成，跳过"; exit 0; }
  log "执行首次启动引导"

  mkdir -p "$SECRETS_DIR" "$(dirname "$DONE_FLAG")"
  chmod 700 "$SECRETS_DIR"

  # 生成 API token（若不存在）——必须在 Web 服务启动前完成
  if ! grep -q '^NAISYS_API_TOKEN=' "$ENV_FILE" 2>/dev/null; then
    local token
    token="$(openssl rand -hex 32)"
    echo "NAISYS_API_TOKEN=${token}" >> "$ENV_FILE"
    log "已生成 API token"
  fi

  # [安全加固] 多盘检测警告：preseed early_command 写入的标记
  local disk_warning=""
  if [[ -f /var/lib/naisys/.disk-warning ]]; then
    disk_warning="$(cat /var/lib/naisys/.disk-warning)"
    log "⚠️  检测到多磁盘环境: $disk_warning"
    log "   安装仅格式化了第一块磁盘，请确认其余磁盘数据完好！"
  fi

  # [安全加固] 安装错误检测：late_command 写入的失败标记
  local install_error=""
  if [[ -f /var/lib/naisys/.install-error ]]; then
    install_error="$(cat /var/lib/naisys/.install-error)"
    log "❌ 检测到安装时运行时部署失败: $install_error"
    log "   请手动执行 /opt/naisys/install-runtime.sh 或联系支持"
  fi

  # 尝试启动 tailscale 并获取内网地址（失败不阻塞）
  local ts_addr=""
  if command -v tailscale >/dev/null 2>&1; then
    systemctl start tailscaled 2>/dev/null || true
    ts_addr="$(tailscale ip -4 2>/dev/null || echo '')"
  fi

  # 获取局域网地址
  local lan_addr
  lan_addr="$(hostname -I 2>/dev/null | awk '{print $1}')"

  # 写入引导信息文件（Web 控制台引导页读取）
  cat > /data/naisys/firstboot-info.json <<EOF
{
  "hostname": "$(hostname)",
  "lan_url": "http://${lan_addr:-127.0.0.1}:${CONSOLE_PORT}",
  "tailscale_url": "${ts_addr:+http://${ts_addr}:${CONSOLE_PORT}}",
  "generated_at": "$(date -Iseconds)",
  "disk_warning": "${disk_warning}",
  "install_error": "${install_error}",
  "notice": "初始密码已显示于安装介质，请立即在 Web 控制台修改"
}
EOF
  chmod 644 /data/naisys/firstboot-info.json

  # 生成 API token 后重启 Web 控制台（确保服务以新 token 启动）
  systemctl restart naisys-web-console.service 2>/dev/null || true

  log "======================================================"
  log " NAISys 安装完成，Web 控制台引导页："
  log "   局域网:  http://${lan_addr:-<LAN_IP>}:${CONSOLE_PORT}"
  [[ -n "$ts_addr" ]] && log "   Tailscale: http://${ts_addr}:${CONSOLE_PORT}"
  [[ -n "$disk_warning" ]] && log " ⚠️  多盘警告: $disk_warning — 请确认数据盘完好"
  [[ -n "$install_error" ]] && log " ❌ 安装错误: $install_error — 请手动修复"
  log " 请立即登录并修改初始密码！"
  log "======================================================"

  touch "$DONE_FLAG"
  log "首启引导完成 ✅"
}

main "$@"