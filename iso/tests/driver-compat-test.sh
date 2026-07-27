#!/usr/bin/env bash
# ============================================================================
# driver-compat-test.sh — 网卡驱动兼容性测试
# 用法：sudo ./driver-compat-test.sh [output-dir]
# 产出：驱动兼容性矩阵报告（markdown）+ 原始检测日志
# 适用：Live 环境 / 安装后系统 / QEMU（virtio 回退）
# ============================================================================
set -euo pipefail

OUT_DIR="${1:-.}"
REPORT="${OUT_DIR}/driver-compat-report.md"
RAW_LOG="${OUT_DIR}/driver-compat-raw.log"

log() { printf '[driver-test] %s\n' "$*" | tee -a "$RAW_LOG"; }

# --- 目标驱动列表 ---
declare -A TARGET_DRIVERS=(
  [r8125]="Realtek|RTL8125 (2.5GbE)"
  [r8169]="Realtek|RTL8169/8125 (fallback)"
  [r8156]="Realtek|RTL8156 (2.5GbE USB)"
  [igc]="Intel|i225/i226 (2.5GbE)"
  [e1000e]="Intel|Intel Gigabit Ethernet"
  [mlx5_core]="Mellanox|ConnectX-4/5/6"
  [mlx4_core]="Mellanox|ConnectX-3"
  [virtio_net]="VirtIO|QEMU/KVM virtio-net"
)

# --- 检测函数 ---
detect_kernel_version() {
  uname -r
}

detect_loaded_modules() {
  lsmod | awk 'NR>1 {print $1}' | sort
}

detect_pci_devices() {
  lspci -nn 2>/dev/null | grep -iE 'ethernet|network' || true
}

detect_driver_info() {
  local driver="$1"
  local loaded="❌"
  local version="N/A"
  local firmware="N/A"
  local pci_count=0

  # 检查模块是否已加载
  if lsmod | awk 'NR>1 {print $1}' | grep -qx "$driver"; then
    loaded="✅"
  fi

  # 获取驱动详情
  if modinfo "$driver" >/dev/null 2>&1; then
    version="$(modinfo "$driver" 2>/dev/null | grep '^version:' | head -1 | sed 's/^version:\s*//' || echo 'N/A')"
    firmware="$(modinfo "$driver" 2>/dev/null | grep '^firmware:' | head -1 | sed 's/^firmware:\s*//' || echo 'N/A')"
    [[ -z "$version" ]] && version="内核内置"
  fi

  # 统计匹配的 PCI 设备数
  local vendor product
  vendor="$(echo "${TARGET_DRIVERS[$driver]}" | cut -d'|' -f1)"
  product="$(echo "${TARGET_DRIVERS[$driver]}" | cut -d'|' -f2)"
  pci_count="$(lspci -nn 2>/dev/null | grep -icE "$vendor|$product" || echo 0)"

  echo "$loaded|$version|$firmware|$pci_count"
}

check_firmware_files() {
  local driver="$1"
  local fw_count=0
  # 检查 /lib/firmware 下是否有对应固件
  case "$driver" in
    r8125|r8169|r8156)
      fw_count="$(find /lib/firmware/rtl_nic/ -name '*.bin' 2>/dev/null | wc -l || echo 0)"
      ;;
    igc)
      fw_count="$(find /lib/firmware/intel/ -name 'i225*' 2>/dev/null | wc -l || echo 0)"
      ;;
    mlx5_core)
      fw_count="$(find /lib/firmware/mellanox/ -name '*.bin' 2>/dev/null | wc -l || echo 0)"
      ;;
    mlx4_core)
      fw_count="$(find /lib/firmware/mellanox/ -name '*.bin' 2>/dev/null | wc -l || echo 0)"
      ;;
  esac
  echo "$fw_count"
}

check_interface_link() {
  # 检测所有网络接口的链路状态
  local result=""
  for iface in /sys/class/net/*; do
    local name
    name="$(basename "$iface")"
    [[ "$name" == "lo" ]] && continue
    local driver_name="unknown"
    local speed="N/A"
    local link="down"

    if [[ -L "$iface/device/driver" ]]; then
      driver_name="$(basename "$(readlink "$iface/device/driver")")"
    fi
    if [[ -f "$iface/speed" ]]; then
      speed="$(cat "$iface/speed" 2>/dev/null || echo 'N/A')"
      [[ "$speed" != "N/A" && -n "$speed" ]] && speed="${speed}Mb/s"
    fi
    if [[ "$(cat "$iface/operstate" 2>/dev/null)" == "up" ]]; then
      link="up"
    fi

    result+="| $name | $driver_name | $link | $speed |\n"
  done
  echo -e "$result"
}

# --- 主流程 ---
main() {
  mkdir -p "$OUT_DIR"
  : > "$RAW_LOG"

  log "网卡驱动兼容性测试开始"
  log "内核版本: $(detect_kernel_version)"
  log "检测时间: $(date -Iseconds)"

  # 收集 PCI 网络设备
  log "PCI 网络设备:"
  detect_pci_devices | tee -a "$RAW_LOG"

  # 生成报告
  cat > "$REPORT" <<EOF
# NAISys 网卡驱动兼容性矩阵报告

- **内核版本**: $(detect_kernel_version)
- **检测时间**: $(date -Iseconds)
- **主机名**: $(hostname)

## 驱动兼容性矩阵

| 驱动 | 厂商 | 产品 | 已加载 | 版本 | 固件文件数 | PCI 设备数 |
|------|------|------|--------|------|-----------|-----------|
EOF

  for driver in "${!TARGET_DRIVERS[@]}"; do
    local vendor product info loaded version firmware pci_count fw_count
    vendor="$(echo "${TARGET_DRIVERS[$driver]}" | cut -d'|' -f1)"
    product="$(echo "${TARGET_DRIVERS[$driver]}" | cut -d'|' -f2)"
    info="$(detect_driver_info "$driver")"
    loaded="$(echo "$info" | cut -d'|' -f1)"
    version="$(echo "$info" | cut -d'|' -f2)"
    firmware="$(echo "$info" | cut -d'|' -f3)"
    pci_count="$(echo "$info" | cut -d'|' -f4)"
    fw_count="$(check_firmware_files "$driver")"

    echo "| $driver | $vendor | $product | $loaded | $version | $fw_count | $pci_count |" >> "$REPORT"
    log "  $driver: loaded=$loaded version=$version fw_files=$fw_count pci=$pci_count"
  done

  # 网络接口状态
  cat >> "$REPORT" <<EOF

## 网络接口链路状态

| 接口 | 驱动 | 链路 | 速率 |
|------|------|------|------|
$(check_interface_link)

## 固件文件清单

\`\`\`
$(find /lib/firmware/ -name '*.bin' -path '*rtl*' -o -name '*.bin' -path '*intel*' -o -name '*.bin' -path '*mellanox*' 2>/dev/null | head -30 || echo "无匹配固件文件")
\`\`\`

## 内核启动日志（驱动相关）

\`\`\`
$(dmesg 2>/dev/null | grep -iE 'r8125|r8169|igc|e1000|mlx|firmware|virtio_net|link' | tail -30 || echo "无相关日志")
\`\`\`

## 评估结论

EOF

  # 自动评估
  local loaded_count=0
  local total_count=${#TARGET_DRIVERS[@]}
  for driver in "${!TARGET_DRIVERS[@]}"; do
    if lsmod | awk 'NR>1 {print $1}' | grep -qx "$driver"; then
      ((loaded_count++)) || true
    fi
  done

  if [[ $loaded_count -gt 0 ]]; then
    echo "- ✅ 检测到 $loaded_count/$total_count 个目标驱动已加载" >> "$REPORT"
  else
    echo "- ⚠️ 无目标驱动加载（QEMU 环境使用 virtio_net 为正常现象）" >> "$REPORT"
  fi

  # virtio 特殊说明
  if lsmod | awk 'NR>1 {print $1}' | grep -qx "virtio_net"; then
    echo "- ℹ️ 当前为虚拟化环境（virtio_net），消费级网卡驱动需在真机验证" >> "$REPORT"
  fi

  echo "" >> "$REPORT"
  echo "---" >> "$REPORT"
  echo "*报告由 driver-compat-test.sh 自动生成*" >> "$REPORT"

  log "报告已生成: $REPORT"
  log "原始日志: $RAW_LOG"
  log "测试完成 ✅"
}

main "$@"
