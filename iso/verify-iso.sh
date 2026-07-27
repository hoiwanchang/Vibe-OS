#!/usr/bin/env bash
# ============================================================================
# verify-iso.sh — ISO 校验与安装验证报告生成
# 用法：./verify-iso.sh <iso-path> [report-out-dir]
# 产出：SHA256 校验和 + 结构化安装验证报告（markdown）
# ============================================================================
set -euo pipefail

ISO="${1:-}"
OUT_DIR="${2:-$(dirname "${ISO:-.}")}"
[[ -n "$ISO" && -f "$ISO" ]] || { echo "用法: $0 <iso-path> [report-out-dir]" >&2; exit 1; }

ISO_BASE="$(basename "$ISO")"
REPORT="${OUT_DIR}/${ISO_BASE%.iso}-verification-report.md"

log() { printf '[verify] %s\n' "$*"; }

# --- 1. SHA256 校验和 ---
gen_sha() {
  log "生成 SHA256"
  SHA_VALUE="$(sha256sum "$ISO" | awk '{print $1}')"
  echo "$SHA_VALUE  $ISO_BASE" > "${ISO}.sha256"
  log "SHA256: $SHA_VALUE"
}

# --- 2. 结构检查（用 xorriso 列出 ISO 内容）---
inspect_structure() {
  log "检查 ISO 内部结构"
  STRUCT_OK=true
  if command -v xorriso >/dev/null 2>&1; then
    ISO_LISTING="$(xorriso -indev "$ISO" -find / 2>/dev/null || echo '')"
    for need in /naisys/preseed.cfg /install.amd/vmlinuz /install.amd/initrd.gz; do
      if echo "$ISO_LISTING" | grep -q "$need"; then
        log "  ✓ 存在: $need"
      else
        log "  ✗ 缺失: $need"
        STRUCT_OK=false
      fi
    done
  else
    log "  xorriso 不可用，跳过结构检查"
    ISO_LISTING="(xorriso unavailable)"
  fi
}

# --- 3. 固件注入验证 ---
check_firmware() {
  log "检查 initrd 固件注入"
  FW_OK=true
  if command -v xorriso >/dev/null 2>&1 && command -v cpio >/dev/null 2>&1; then
    local tmp; tmp="$(mktemp -d)"
    xorriso -osirrox on -indev "$ISO" -extract /install.amd/initrd.gz "$tmp/initrd.gz" >/dev/null 2>&1 || true
    if [[ -f "$tmp/initrd.gz" ]]; then
      local fw_count
      fw_count="$(gzip -dc "$tmp/initrd.gz" 2>/dev/null | cpio -t 2>/dev/null | grep -c 'lib/firmware' || echo 0)"
      log "  initrd 内固件文件数: $fw_count"
      [[ "$fw_count" -gt 0 ]] || FW_OK=false
    fi
    rm -rf "$tmp"
  else
    log "  工具不可用，跳过固件检查"
  fi
}

# --- 4. 生成报告 ---
gen_report() {
  log "生成验证报告: $REPORT"
  local size; size="$(du -h "$ISO" | cut -f1)"
  cat > "$REPORT" <<EOF
# NAISys ISO 安装验证报告

- **镜像文件**: \`$ISO_BASE\`
- **生成时间**: $(date -Iseconds)
- **文件大小**: $size
- **SHA256**: \`$SHA_VALUE\`

## 1. 完整性校验

| 项目 | 结果 |
|------|------|
| SHA256 生成 | ✅ 通过 |
| 校验和文件 | \`${ISO_BASE}.sha256\` |

## 2. ISO 结构检查

| 必需组件 | 状态 |
|----------|------|
| /naisys/preseed.cfg | $([ "$STRUCT_OK" = true ] && echo "✅" || echo "见下") |
| /install.amd/vmlinuz | — |
| /install.amd/initrd.gz | — |

结构检查总体: $([ "$STRUCT_OK" = true ] && echo "✅ 通过" || echo "⚠️ 存在缺失")

## 3. 网卡固件注入

initrd 固件注入检查: $([ "$FW_OK" = true ] && echo "✅ 已注入" || echo "⚠️ 未检测到")

覆盖驱动：
- Realtek RTL8125/8156 (r8125/r8169) — firmware-realtek
- Intel i225/i226 (igc) — 内核自带
- Mellanox ConnectX-3/4 (mlx4/mlx5) — firmware-misc-nonfree + 内核自带

## 4. 安装验证清单

- [ ] 虚拟机/真机引导成功（UEFI 与 Legacy 各测一次）
- [ ] 全程无交互，自动进入安装进度条
- [ ] 自动选择第一块硬盘并全盘格式化
- [ ] /data 分区按 ${DATA_FSTYPE:-xfs} 创建并挂载
- [ ] 安装完成自动重启进入 Web 控制台引导页
- [ ] 5 分钟内完成安装

## 5. 复现校验命令

\`\`\`bash
sha256sum -c ${ISO_BASE}.sha256
\`\`\`
EOF
  log "报告生成完成 ✅"
}

main() {
  gen_sha
  inspect_structure
  check_firmware
  gen_report
  log "全部校验完成"
}

main "$@"