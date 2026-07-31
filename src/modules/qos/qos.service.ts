/**
 * 模块：QoS 带宽控制 — 业务逻辑层
 * 通过 Linux tc (traffic control) 实现带宽限制
 */
import * as crypto from 'node:crypto';
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import type {
  CreateQosRuleRequest,
  QosDirection,
  QosInterfaceStats,
  QosResult,
  QosRule,
  QosRuleType,
  QosStatus,
} from './qos.types.js';

/** 内存规则存储 */
const rules = new Map<string, QosRule>();

/** 速率限制格式校验 (如 '10mbit', '1gbit', '512kbit') */
const RATE_PATTERN = /^\d+(\.\d+)?[kmg]?bit$/i;

/**
 * 校验速率限制格式
 */
function validateRateLimit(rate: string): void {
  if (!RATE_PATTERN.test(rate)) {
    throw AppError.badRequest(
      'INVALID_RATE',
      `速率格式无效: ${rate}，应为如 '10mbit'、'1gbit'、'512kbit'`,
    );
  }
}

/**
 * 构建 tc filter 匹配参数
 */
function buildFilterMatchArgs(
  type: QosRuleType,
  target: string,
  direction: QosDirection,
): string[] {
  const args: string[] = [];
  switch (type) {
    case 'ip':
      if (direction === 'egress') {
        args.push('match', 'ip', 'dst', `${target}/32`);
      } else {
        args.push('match', 'ip', 'src', `${target}/32`);
      }
      break;
    case 'port':
      if (direction === 'egress') {
        args.push('match', 'ip', 'dport', target, '0xffff');
      } else {
        args.push('match', 'ip', 'sport', target, '0xffff');
      }
      break;
    case 'protocol':
      args.push('match', 'ip', 'protocol', target, '0xff');
      break;
  }
  return args;
}

/**
 * 获取 QoS 规则列表
 * 解析 tc qdisc/class/filter 输出
 */
export async function listRules(): Promise<QosRule[]> {
  // 先尝试从 tc 解析，同时返回内存中的规则
  const result = await executeCommand('tc', ['filter', 'show']);

  // 解析 tc filter 输出，补充内存中可能缺失的规则
  parseTcFilters(result.stdout);

  return Array.from(rules.values()).sort(
    (a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * 解析 tc filter show 输出，同步到内存规则
 */
function parseTcFilters(output: string): void {
  const lines = output.split('\n');
  for (const line of lines) {
    // 匹配 filter 行中的 flowid
    const flowMatch = line.match(/flowid\s+(\d+:\d+)/);
    if (flowMatch) {
      const classId = flowMatch[1] ?? '';
      // 检查是否已有此 classId 的规则
      let exists = false;
      for (const rule of rules.values()) {
        if (rule.classId === classId) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        // 从 tc 输出中无法完整还原所有参数，跳过
        continue;
      }
    }
  }
}

/**
 * 创建 QoS 规则
 */
export async function createRule(req: CreateQosRuleRequest): Promise<QosResult> {
  validateRateLimit(req.rateLimit);

  const id = crypto.randomUUID().slice(0, 8);
  const priority = req.priority ?? 10;
  const classId = `1:${10 + rules.size}`;

  // 确保根 qdisc 存在 (htb)
  await executeCommand('tc', [
    'qdisc', 'add', 'dev', req.interface,
    'root', 'handle', '1:', 'htb', 'default', '10',
  ]);

  // 添加 class
  await executeCommandStrict('tc', [
    'class', 'add', 'dev', req.interface,
    'parent', '1:', 'classid', classId,
    'htb', 'rate', req.rateLimit, 'ceil', req.rateLimit,
  ]);

  // 添加 filter
  const matchArgs = buildFilterMatchArgs(req.type, req.target, req.direction);
  await executeCommandStrict('tc', [
    'filter', 'add', 'dev', req.interface,
    'parent', '1:', 'protocol', 'ip',
    'prio', String(priority), 'u32',
    ...matchArgs,
    'flowid', classId,
  ]);

  const rule: QosRule = {
    id,
    interface: req.interface,
    type: req.type,
    target: req.target,
    direction: req.direction,
    rateLimit: req.rateLimit,
    priority,
    classId,
    createdAt: new Date().toISOString(),
  };

  rules.set(id, rule);

  return {
    ruleId: id,
    message: `QoS 规则已创建: ${req.interface} ${req.type}=${req.target} → ${req.rateLimit}`,
  };
}

/**
 * 删除 QoS 规则
 */
export async function deleteRule(id: string): Promise<QosResult> {
  const rule = rules.get(id);
  if (!rule) {
    throw AppError.notFound(`QoS 规则 ${id}`);
  }

  // 删除 filter
  await executeCommand('tc', [
    'filter', 'del', 'dev', rule.interface,
    'parent', '1:', 'prio', String(rule.priority),
  ]);

  // 删除 class
  await executeCommand('tc', [
    'class', 'del', 'dev', rule.interface,
    'parent', '1:', 'classid', rule.classId,
  ]);

  rules.delete(id);

  return {
    ruleId: id,
    message: `QoS 规则已删除: ${id}`,
  };
}

/**
 * 获取接口流量统计
 * 解析 tc -s qdisc show 输出
 */
export async function getStatus(): Promise<QosStatus> {
  const result = await executeCommand('tc', ['-s', 'qdisc', 'show']);
  const interfaces = parseTcStats(result.stdout);

  return {
    interfaces,
    raw: result.stdout,
  };
}

/**
 * 解析 tc -s qdisc show 输出
 */
function parseTcStats(output: string): QosInterfaceStats[] {
  const stats: QosInterfaceStats[] = [];
  const blocks = output.split('\n\n');

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const headerLine = lines[0]!;
    const devMatch = headerLine.match(/dev\s+(\S+)/);
    const qdiscMatch = headerLine.match(/^qdisc\s+(\S+)/);
    if (!devMatch || !qdiscMatch) continue;

    const iface = devMatch[1] ?? '';
    const qdisc = qdiscMatch[1] ?? '';

    // 查找统计行: " Sent 12345 bytes 100 pkt (dropped 0, overlimits 0 ..."
    let bytes = 0;
    let packets = 0;
    let dropped = 0;
    let overlimits = 0;

    for (const line of lines) {
      const sentMatch = line.match(/Sent\s+(\d+)\s+bytes\s+(\d+)\s+pkt/);
      if (sentMatch) {
        bytes = parseInt(sentMatch[1] ?? '0', 10);
        packets = parseInt(sentMatch[2] ?? '0', 10);
      }
      const dropMatch = line.match(/dropped\s+(\d+)/);
      if (dropMatch) {
        dropped = parseInt(dropMatch[1] ?? '0', 10);
      }
      const overMatch = line.match(/overlimits\s+(\d+)/);
      if (overMatch) {
        overlimits = parseInt(overMatch[1] ?? '0', 10);
      }
    }

    stats.push({
      interface: iface,
      qdisc,
      bytes,
      packets,
      dropped,
      overlimits,
    });
  }

  return stats;
}

/**
 * 重置内部状态（仅用于测试）
 */
export function _resetForTesting(): void {
  rules.clear();
}
