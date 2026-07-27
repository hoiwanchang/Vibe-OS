/**
 * 格式化工具函数（纯函数，单元测试覆盖）
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * 字节数格式化为人类可读字符串
 * @param bytes - 字节数（接受 number 或字符串，后端 bigint 以 string 传输）
 * @param decimals - 小数位数，默认 1
 * @returns 如 '1.2 TB'；非法输入返回 '—'
 */
export function formatBytes(
  bytes: number | string | null | undefined,
  decimals = 1,
): string {
  if (bytes === null || bytes === undefined) return '—';
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n === 0) return '0 B';

  const k = 1024;
  const exp = Math.min(Math.floor(Math.log(n) / Math.log(k)), UNITS.length - 1);
  const value = n / k ** exp;
  const unit = UNITS[exp] ?? 'B';
  return `${value.toFixed(decimals)} ${unit}`;
}

/**
 * 秒数格式化为运行时长
 * @param seconds - 秒数
 * @returns 如 '14 天 21 小时' / '3 小时 12 分' / '45 秒'
 */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const s = Math.floor(seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);

  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分 ${s % 60} 秒`;
  return `${s} 秒`;
}

/**
 * ISO 时间戳格式化为本地短格式
 * @param iso - ISO 8601 字符串
 * @returns 如 '07-27 18:30:05'
 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 根据使用率返回语义颜色档位
 * @param percent - 百分比（0-100）
 * @returns 'ok' | 'warn' | 'critical'
 */
export function usageLevel(percent: number): 'ok' | 'warn' | 'critical' {
  if (percent >= 90) return 'critical';
  if (percent >= 75) return 'warn';
  return 'ok';
}

/**
 * 将数值约束在 [min, max] 区间
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
