/**
 * 模块：SSD 缓存管理 — 业务逻辑层
 * 使用 LVM cache (lvconvert) 实现 SSD 缓存加速
 */
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import type {
  CreateSsdCacheRequest,
  SsdCacheCreateResult,
  SsdCacheMode,
  SsdCacheStatus,
} from './ssd-cache.types.js';

/**
 * 从 poolDevice 路径提取 VG 和 LV 名称
 * 如 /dev/vg0/lv_data → { vg: 'vg0', lv: 'lv_data' }
 */
function parseLvPath(poolDevice: string): { vg: string; lv: string } {
  // 支持 /dev/vg/lv 和 vg/lv 两种格式
  const cleaned = poolDevice.replace(/^\/dev\//, '');
  const parts = cleaned.split('/');
  if (parts.length < 2) {
    throw AppError.badRequest('VALIDATION_ERROR', `无效的 LV 路径: ${poolDevice}，格式应为 /dev/vg/lv`);
  }
  return { vg: parts[0]!, lv: parts[1]! };
}

/**
 * 创建 SSD 缓存
 * 步骤：
 * 1. 在 SSD 上创建 PV（如果尚未创建）
 * 2. 创建 cache pool LV
 * 3. 将 cache pool 关联到目标 LV
 */
export async function createCache(req: CreateSsdCacheRequest): Promise<SsdCacheCreateResult> {
  const { vg, lv } = parseLvPath(req.poolDevice);
  const cacheName = `${lv}_cache`;

  // 检查目标 LV 是否存在
  const checkResult = await executeCommand('lvs', [
    '--noheadings', '-o', 'lv_name', `${vg}/${lv}`,
  ]);
  if (checkResult.exitCode !== 0 || !checkResult.stdout.trim()) {
    throw AppError.notFound(`逻辑卷 ${vg}/${lv}`);
  }

  // 检查是否已有缓存
  const attrResult = await executeCommand('lvs', [
    '--noheadings', '-o', 'lv_attr', `${vg}/${lv}`,
  ]);
  if (attrResult.stdout.includes('C')) {
    throw AppError.conflict(`逻辑卷 ${vg}/${lv} 已配置缓存`);
  }

  // 获取 SSD 设备大小用于创建 cache pool
  const ssdSizeResult = await executeCommandStrict('pvs', [
    '--noheadings', '--nosuffix', '--units', 'b', '-o', 'pv_size', req.ssdDevice,
  ]);
  const ssdSizeBytes = parseInt(ssdSizeResult.stdout.trim(), 10);
  if (Number.isNaN(ssdSizeBytes) || ssdSizeBytes <= 0) {
    throw AppError.badRequest('VALIDATION_ERROR', `无法获取 SSD 设备大小: ${req.ssdDevice}`);
  }

  // 使用 90% 的 SSD 空间作为 cache pool
  const cacheSizeBytes = Math.floor(ssdSizeBytes * 0.9);

  // 创建 cache pool LV
  await executeCommandStrict('lvcreate', [
    '--type', 'cache-pool',
    '--name', cacheName,
    '--size', `${cacheSizeBytes}b`,
    `${vg}`,
    req.ssdDevice,
  ]);

  // 将 cache pool 关联到目标 LV
  const modeFlag = req.mode === 'read' ? '--cachemode' : '--cachemode';
  const cacheMode = req.mode === 'readwrite' ? 'writethrough' : req.mode === 'write' ? 'writeback' : 'writethrough';
  await executeCommandStrict('lvconvert', [
    '--type', 'cache',
    modeFlag, cacheMode,
    '--cachepool', `${vg}/${cacheName}`,
    `${vg}/${lv}`,
  ]);

  return {
    name: `${vg}/${lv}`,
    mode: req.mode,
    message: `SSD 缓存创建成功: ${req.ssdDevice} → ${vg}/${lv} (模式: ${req.mode})`,
  };
}

/**
 * 移除 SSD 缓存
 * 使用 lvconvert --uncache 分离缓存
 */
export async function removeCache(name: string): Promise<{ name: string; message: string }> {
  // name 格式: vg/lv
  const checkResult = await executeCommand('lvs', [
    '--noheadings', '-o', 'lv_name', name,
  ]);
  if (checkResult.exitCode !== 0 || !checkResult.stdout.trim()) {
    throw AppError.notFound(`逻辑卷 ${name}`);
  }

  await executeCommandStrict('lvconvert', ['--uncache', name]);

  return {
    name,
    message: `SSD 缓存已移除: ${name}`,
  };
}

/**
 * 获取所有 SSD 缓存状态列表
 * 解析 lvs 和 dmsetup status 输出
 */
export async function getStatusList(): Promise<SsdCacheStatus[]> {
  // 列出所有带缓存的 LV
  const lvsResult = await executeCommand('lvs', [
    '--noheadings', '--nosuffix', '--units', 'b',
    '-o', 'lv_name,vg_name,lv_attr,lv_size,pool_lv',
    '--select', 'lv_attr=~C',
  ]);

  if (lvsResult.exitCode !== 0 || !lvsResult.stdout.trim()) {
    return [];
  }

  const caches: SsdCacheStatus[] = [];
  const lines = lvsResult.stdout.trim().split('\n');

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;

    const [lvName, vgName, , sizeStr, poolLv] = parts;
    const fullName = `${vgName}/${lvName}`;

    // 获取 dm-cache 统计（命中率等）
    const dmResult = await executeCommand('dmsetup', ['status', `${vgName}-${lvName}`]);
    let hitRate = 0;
    let usedBlocks = 0;
    let totalBlocks = 0;

    if (dmResult.exitCode === 0 && dmResult.stdout.trim()) {
      // dm-cache status 格式: 0 <size> cache <metadata_block_size> ... <read_hits> <read_misses> <write_hits> <write_misses> ...
      const statusParts = dmResult.stdout.trim().split(/\s+/);
      // 尝试解析命中率（位置因内核版本而异）
      const numericParts = statusParts.filter(p => /^\d+$/.test(p));
      if (numericParts.length >= 6) {
        const readHits = parseInt(numericParts[2] ?? '0', 10);
        const readMisses = parseInt(numericParts[3] ?? '0', 10);
        const writeHits = parseInt(numericParts[4] ?? '0', 10);
        const writeMisses = parseInt(numericParts[5] ?? '0', 10);
        const totalHits = readHits + writeHits;
        const totalOps = totalHits + readMisses + writeMisses;
        hitRate = totalOps > 0 ? Math.round((totalHits / totalOps) * 10000) / 100 : 0;
      }
      if (numericParts.length >= 2) {
        usedBlocks = parseInt(numericParts[0] ?? '0', 10);
        totalBlocks = parseInt(numericParts[1] ?? '0', 10);
      }
    }

    // 获取 SSD 温度和寿命（通过 smartctl）
    let temperature = 0;
    let lifePercent = 100;
    const poolLvName = poolLv ?? '';
    // 尝试从 cache pool 关联的 PV 获取 SMART 数据
    const pvsResult = await executeCommand('pvs', [
      '--noheadings', '-o', 'pv_name', '--select', `vg_name=${vgName}`,
    ]);
    if (pvsResult.exitCode === 0) {
      const pvDevices = pvsResult.stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
      for (const dev of pvDevices) {
        const smartResult = await executeCommand('smartctl', ['-A', dev]);
        if (smartResult.exitCode === 0) {
          const tempMatch = smartResult.stdout.match(/Temperature_Celsius\s+.*\s(\d+)\s*$/m);
          if (tempMatch) temperature = parseInt(tempMatch[1]!, 10);
          const lifeMatch = smartResult.stdout.match(/Media_Wearout_Indicator\s+.*\s(\d+)\s*$/m)
            ?? smartResult.stdout.match(/Percent_Lifetime_Remain\s+.*\s(\d+)\s*$/m);
          if (lifeMatch) lifePercent = parseInt(lifeMatch[1]!, 10);
          if (temperature > 0) break;
        }
      }
    }

    const mode: SsdCacheMode = 'readwrite'; // 默认，实际可从 lv_attr 推断

    caches.push({
      name: fullName,
      mode,
      cachePool: poolLvName ? `${vgName}/${poolLvName}` : '',
      originLv: fullName,
      hitRate,
      temperature,
      lifePercent,
      sizeBytes: parseInt(sizeStr ?? '0', 10),
      usedBlocks,
      totalBlocks,
    });
  }

  return caches;
}

/**
 * 获取单个 SSD 缓存详情
 */
export async function getCacheDetail(name: string): Promise<SsdCacheStatus> {
  const allCaches = await getStatusList();
  const cache = allCaches.find(c => c.name === name);
  if (!cache) {
    throw AppError.notFound(`SSD 缓存 ${name}`);
  }
  return cache;
}
