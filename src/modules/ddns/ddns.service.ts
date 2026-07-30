/**
 * 模块：动态 DNS — 业务逻辑
 * 支持 Cloudflare / 阿里云 DNS / 自定义 HTTP 接口
 * 离线环境自动禁用（检测网络连通性）
 */
import { randomUUID, createHmac } from 'node:crypto';
import { AppError } from '../../common/app-error.js';
import * as dao from './ddns.dao.js';
import type {
  DdnsConfig,
  DdnsRecord,
  DdnsStatus,
  DdnsUpdateResult,
  DdnsHistoryEntry,
} from './ddns.types.js';

/** 网络连通性检测超时（毫秒） */
const CONNECTIVITY_TIMEOUT_MS = 5000;

/** DNS API 请求超时（毫秒） */
const API_TIMEOUT_MS = 10000;

/* ---------- 网络连通性检测 ---------- */

/**
 * 检测网络是否在线
 * 依次尝试 ipCheckUrls 中的地址，任一可达即视为在线
 */
export async function checkOnline(ipCheckUrls?: string[]): Promise<boolean> {
  const urls = ipCheckUrls ?? (await dao.loadConfig()).ipCheckUrls;
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return true;
    } catch {
      // 继续尝试下一个
    }
  }
  return false;
}

/**
 * 获取公网 IP
 * 依次尝试 ipCheckUrls，返回第一个成功获取的 IP
 */
export async function getPublicIp(ipCheckUrls?: string[]): Promise<string | null> {
  const urls = ipCheckUrls ?? (await dao.loadConfig()).ipCheckUrls;
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const text = (await res.text()).trim();
        // 简单校验 IP 格式
        if (/^[\d.]+$/.test(text) || /^[\da-fA-F:]+$/.test(text)) {
          return text;
        }
      }
    } catch {
      // 继续尝试下一个
    }
  }
  return null;
}

/* ---------- 状态 ---------- */

/** 获取 DDNS 状态 */
export async function getStatus(): Promise<DdnsStatus> {
  const config = await dao.loadConfig();
  const online = await checkOnline(config.ipCheckUrls);
  const publicIp = online ? await getPublicIp(config.ipCheckUrls) : null;

  return {
    enabled: config.enabled,
    online,
    publicIp,
    recordCount: config.records.length,
    records: config.records.map((r) => ({
      id: r.id,
      domain: r.domain,
      subdomain: r.subdomain,
      provider: r.provider,
      enabled: r.enabled,
      lastIp: r.lastIp,
      lastStatus: r.lastStatus,
      lastUpdated: r.lastUpdated,
    })),
  };
}

/* ---------- 配置管理 ---------- */

/** 获取完整配置 */
export async function getConfig(): Promise<DdnsConfig> {
  return dao.loadConfig();
}

/** 更新配置（合并式） */
export async function updateConfig(
  data: Partial<Pick<DdnsConfig, 'enabled' | 'intervalMinutes' | 'ipCheckUrls'>> & {
    records?: DdnsRecord[];
  },
): Promise<DdnsConfig> {
  const config = await dao.loadConfig();

  if (typeof data.enabled === 'boolean') config.enabled = data.enabled;
  if (typeof data.intervalMinutes === 'number') config.intervalMinutes = data.intervalMinutes;
  if (Array.isArray(data.ipCheckUrls)) config.ipCheckUrls = data.ipCheckUrls;
  if (Array.isArray(data.records)) config.records = data.records;

  await dao.saveConfig(config);
  return config;
}

/** 添加一条 DDNS 记录 */
export async function addRecord(
  record: Omit<DdnsRecord, 'id' | 'lastIp' | 'lastUpdated' | 'lastStatus'>,
): Promise<DdnsRecord> {
  const config = await dao.loadConfig();
  const newRecord: DdnsRecord = {
    ...record,
    id: randomUUID(),
    lastIp: null,
    lastUpdated: null,
    lastStatus: null,
  };
  config.records.push(newRecord);
  await dao.saveConfig(config);
  return newRecord;
}

/** 删除一条 DDNS 记录 */
export async function removeRecord(id: string): Promise<void> {
  const config = await dao.loadConfig();
  const idx = config.records.findIndex((r) => r.id === id);
  if (idx === -1) throw AppError.notFound(`DDNS 记录 ${id}`);
  config.records.splice(idx, 1);
  await dao.saveConfig(config);
}

/* ---------- DNS 更新执行 ---------- */

/**
 * 执行单条记录的 DNS 更新
 * 离线时自动跳过（优雅降级）
 */
async function executeUpdate(
  record: DdnsRecord,
  ip: string,
): Promise<{ status: 'success' | 'failed' | 'skipped'; message: string }> {
  // IP 未变化则跳过
  if (record.lastIp === ip) {
    return { status: 'skipped', message: 'IP 未变化，跳过更新' };
  }

  try {
    switch (record.provider) {
      case 'cloudflare':
        await updateCloudflare(record, ip);
        break;
      case 'aliyun':
        await updateAliyun(record, ip);
        break;
      case 'custom':
        await updateCustom(record, ip);
        break;
      default:
        return { status: 'failed', message: `不支持的提供商: ${record.provider as string}` };
    }
    return { status: 'success', message: `已更新 ${record.subdomain}.${record.domain} → ${ip}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'failed', message: msg };
  }
}

/** Cloudflare DNS API 更新 */
async function updateCloudflare(record: DdnsRecord, ip: string): Promise<void> {
  const creds = record.credentials as { apiToken: string; zoneId: string };
  const fqdn = record.subdomain === '@'
    ? record.domain
    : `${record.subdomain}.${record.domain}`;

  // 1. 查询现有记录 ID
  const listUrl = `https://api.cloudflare.com/client/v4/zones/${creds.zoneId}/dns_records?type=${record.recordType}&name=${fqdn}`;
  const listRes = await fetchWithTimeout(listUrl, {
    headers: {
      'Authorization': `Bearer ${creds.apiToken}`,
      'Content-Type': 'application/json',
    },
  });
  const listData = await listRes.json() as {
    success: boolean;
    result: Array<{ id: string }>;
    errors?: Array<{ message: string }>;
  };

  if (!listData.success) {
    throw new Error(`Cloudflare 查询失败: ${listData.errors?.[0]?.message ?? '未知错误'}`);
  }

  const recordId = listData.result[0]?.id;

  if (recordId) {
    // 2. 更新现有记录
    const updateUrl = `https://api.cloudflare.com/client/v4/zones/${creds.zoneId}/dns_records/${recordId}`;
    const updateRes = await fetchWithTimeout(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${creds.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: record.recordType,
        name: fqdn,
        content: ip,
        ttl: 120,
        proxied: false,
      }),
    });
    const updateData = await updateRes.json() as { success: boolean; errors?: Array<{ message: string }> };
    if (!updateData.success) {
      throw new Error(`Cloudflare 更新失败: ${updateData.errors?.[0]?.message ?? '未知错误'}`);
    }
  } else {
    // 3. 创建新记录
    const createUrl = `https://api.cloudflare.com/client/v4/zones/${creds.zoneId}/dns_records`;
    const createRes = await fetchWithTimeout(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: record.recordType,
        name: fqdn,
        content: ip,
        ttl: 120,
        proxied: false,
      }),
    });
    const createData = await createRes.json() as { success: boolean; errors?: Array<{ message: string }> };
    if (!createData.success) {
      throw new Error(`Cloudflare 创建失败: ${createData.errors?.[0]?.message ?? '未知错误'}`);
    }
  }
}

/** 阿里云 DNS API 更新（签名 v1） */
async function updateAliyun(record: DdnsRecord, ip: string): Promise<void> {
  const creds = record.credentials as { accessKeyId: string; accessKeySecret: string };

  const fqdn = record.subdomain === '@'
    ? record.domain
    : `${record.subdomain}.${record.domain}`;

  // 1. 查询现有记录
  const describeParams = buildAliyunParams(creds.accessKeyId, {
    Action: 'DescribeSubDomainRecords',
    SubDomain: fqdn,
    Type: record.recordType,
    DomainName: record.domain,
  });
  const describeUrl = `https://alidns.aliyuncs.com/?${describeParams}`;
  const describeRes = await fetchWithTimeout(describeUrl, { method: 'GET' });
  const describeData = await describeRes.json() as {
    DomainRecords?: { Record?: Array<{ RecordId: string }> };
  };

  const existingRecordId = describeData.DomainRecords?.Record?.[0]?.RecordId;

  if (existingRecordId) {
    // 2. 更新记录
    const updateParams = buildAliyunParams(creds.accessKeyId, {
      Action: 'UpdateDomainRecord',
      RecordId: existingRecordId,
      RR: record.subdomain === '@' ? '@' : record.subdomain,
      Type: record.recordType,
      Value: ip,
      TTL: '120',
    });
    const sign = signAliyun(creds.accessKeySecret, 'GET', updateParams);
    const updateUrl = `https://alidns.aliyuncs.com/?${updateParams}&Signature=${encodeURIComponent(sign)}`;
    const updateRes = await fetchWithTimeout(updateUrl, { method: 'GET' });
    const updateData = await updateRes.json() as { Code?: string; Message?: string };
    if (updateData.Code) {
      throw new Error(`阿里云更新失败: ${updateData.Message ?? updateData.Code}`);
    }
  } else {
    // 3. 添加记录
    const addParams = buildAliyunParams(creds.accessKeyId, {
      Action: 'AddDomainRecord',
      DomainName: record.domain,
      RR: record.subdomain === '@' ? '@' : record.subdomain,
      Type: record.recordType,
      Value: ip,
      TTL: '120',
    });
    const sign = signAliyun(creds.accessKeySecret, 'GET', addParams);
    const addUrl = `https://alidns.aliyuncs.com/?${addParams}&Signature=${encodeURIComponent(sign)}`;
    const addRes = await fetchWithTimeout(addUrl, { method: 'GET' });
    const addData = await addRes.json() as { Code?: string; Message?: string };
    if (addData.Code) {
      throw new Error(`阿里云添加失败: ${addData.Message ?? addData.Code}`);
    }
  }
}

/** 构建阿里云公共请求参数（不含签名） */
function buildAliyunParams(
  accessKeyId: string,
  bizParams: Record<string, string>,
): string {
  const params: Record<string, string> = {
    Format: 'JSON',
    Version: '2015-01-09',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    SignatureVersion: '1.0',
    SignatureNonce: randomUUID(),
    ...bizParams,
  };
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/** 阿里云 HMAC-SHA1 签名 */
function signAliyun(
  accessKeySecret: string,
  method: string,
  queryString: string,
): string {
  const stringToSign = `${method}&${encodeURIComponent('/')}&${encodeURIComponent(queryString)}`;
  return createHmac('sha1', `${accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64');
}

/** 自定义 HTTP 接口更新 */
async function updateCustom(record: DdnsRecord, ip: string): Promise<void> {
  const custom = record.custom;
  if (!custom) {
    throw new Error('自定义接口配置缺失');
  }

  const fqdn = record.subdomain === '@'
    ? record.domain
    : `${record.subdomain}.${record.domain}`;

  const url = custom.url
    .replace(/\{ip\}/g, ip)
    .replace(/\{domain\}/g, fqdn);

  const headers: Record<string, string> = { ...custom.headers };
  let body: string | undefined;

  if (custom.method !== 'GET' && custom.bodyTemplate) {
    body = custom.bodyTemplate
      .replace(/\{ip\}/g, ip)
      .replace(/\{domain\}/g, fqdn);
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const res = await fetchWithTimeout(url, {
    method: custom.method,
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`自定义接口返回 ${res.status}: ${text.slice(0, 200)}`);
  }
}

/** fetch 超时封装 */
async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- 批量更新 ---------- */

/**
 * 执行所有启用记录的 DNS 更新
 * 离线时优雅降级：返回 skipped 状态
 */
export async function runUpdate(): Promise<DdnsUpdateResult[]> {
  const config = await dao.loadConfig();

  if (!config.enabled) {
    throw AppError.badRequest('DDNS_DISABLED', 'DDNS 服务未启用');
  }

  const online = await checkOnline(config.ipCheckUrls);
  if (!online) {
    // 离线优雅降级
    const results: DdnsUpdateResult[] = config.records
      .filter((r) => r.enabled)
      .map((r) => ({
        recordId: r.id,
        domain: `${r.subdomain}.${r.domain}`,
        status: 'skipped' as const,
        ip: null,
        message: '网络离线，跳过更新',
      }));
    // 记录历史
    for (const r of results) {
      await dao.appendHistory({
        id: randomUUID(),
        recordId: r.recordId,
        domain: r.domain,
        provider: config.records.find((rec) => rec.id === r.recordId)?.provider ?? 'custom',
        ip: '',
        status: 'skipped',
        error: '网络离线',
        timestamp: new Date().toISOString(),
      });
    }
    return results;
  }

  const ip = await getPublicIp(config.ipCheckUrls);
  if (!ip) {
    throw AppError.internal('无法获取公网 IP');
  }

  const results: DdnsUpdateResult[] = [];

  for (const record of config.records) {
    if (!record.enabled) continue;

    const { status, message } = await executeUpdate(record, ip);

    // 更新记录状态
    record.lastIp = status === 'success' ? ip : record.lastIp;
    record.lastUpdated = new Date().toISOString();
    record.lastStatus = status;

    results.push({
      recordId: record.id,
      domain: `${record.subdomain}.${record.domain}`,
      status,
      ip: status === 'success' ? ip : null,
      message,
    });

    // 写入历史
    await dao.appendHistory({
      id: randomUUID(),
      recordId: record.id,
      domain: `${record.subdomain}.${record.domain}`,
      provider: record.provider,
      ip: status === 'success' ? ip : '',
      status,
      error: status === 'failed' ? message : null,
      timestamp: new Date().toISOString(),
    });
  }

  // 持久化更新后的记录状态
  await dao.saveConfig(config);

  return results;
}

/* ---------- 历史查询 ---------- */

/** 获取更新历史（最新在前） */
export async function getHistory(limit = 50): Promise<DdnsHistoryEntry[]> {
  const history = await dao.loadHistory();
  return history.slice(-limit).reverse();
}
