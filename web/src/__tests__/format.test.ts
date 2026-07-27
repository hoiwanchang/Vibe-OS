/**
 * 格式化工具 — 单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  clamp,
  formatBytes,
  formatTime,
  formatUptime,
  usageLevel,
} from '../utils/format';

describe('formatBytes', () => {
  it('零值返回 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('应正确换算单位', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
    expect(formatBytes(1024 ** 4)).toBe('1.0 TB');
    expect(formatBytes(3 * 1024 ** 5)).toBe('3.0 PB');
  });

  it('应接受字符串输入（后端 bigint 传输格式）', () => {
    expect(formatBytes('5368709120')).toBe('5.0 GB');
  });

  it('应支持自定义小数位', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
  });

  it('非法输入返回占位符', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes('abc')).toBe('—');
  });
});

describe('formatUptime', () => {
  it('应按量级格式化时长', () => {
    expect(formatUptime(45)).toBe('45 秒');
    expect(formatUptime(125)).toBe('2 分 5 秒');
    expect(formatUptime(3725)).toBe('1 小时 2 分');
    expect(formatUptime(128745)).toBe('1 天 11 小时');
  });

  it('非法输入返回占位符', () => {
    expect(formatUptime(null)).toBe('—');
    expect(formatUptime(undefined)).toBe('—');
    expect(formatUptime(-10)).toBe('—');
    expect(formatUptime(Number.NaN)).toBe('—');
  });
});

describe('formatTime', () => {
  it('应格式化为 MM-DD HH:mm:ss', () => {
    const result = formatTime('2026-07-27T10:30:05.000Z');
    expect(result).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('非法时间返回占位符', () => {
    expect(formatTime('not-a-date')).toBe('—');
    expect(formatTime(null)).toBe('—');
    expect(formatTime(undefined)).toBe('—');
  });
});

describe('usageLevel', () => {
  it('应按阈值分档', () => {
    expect(usageLevel(10)).toBe('ok');
    expect(usageLevel(74.9)).toBe('ok');
    expect(usageLevel(75)).toBe('warn');
    expect(usageLevel(89.9)).toBe('warn');
    expect(usageLevel(90)).toBe('critical');
    expect(usageLevel(100)).toBe('critical');
  });
});

describe('clamp', () => {
  it('应约束数值范围', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
