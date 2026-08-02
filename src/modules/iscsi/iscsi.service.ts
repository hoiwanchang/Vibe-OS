/**
 * 模块：iSCSI Target 管理 — 业务逻辑层
 * 通过 targetcli 命令管理 LIO iSCSI Target
 */
import { AppError } from '../../common/app-error.js';
import { executeCommandStrict } from '../../system/command-executor.js';
import type {
  AddLunRequest,
  CreateIscsiTargetRequest,
  IscsiLunInfo,
  IscsiTargetInfo,
  IscsiTargetResult,
} from './iscsi.types.js';

/**
 * 执行 targetcli 命令
 * targetcli 使用交互式 shell 语法，通过单条命令传入
 */
async function targetcli(args: string): Promise<string> {
  const result = await executeCommandStrict('targetcli', [args]);
  return result.stdout;
}

/**
 * 判断 backingStore 是块设备还是文件
 */
function isBlockDevice(path: string): boolean {
  return path.startsWith('/dev/');
}

/**
 * 创建 iSCSI Target
 * 步骤：
 * 1. 创建后端存储对象（backstore）
 * 2. 创建 iSCSI Target
 * 3. 创建 LUN 映射
 * 4. 配置 CHAP（可选）
 * 5. 配置 Initiator 白名单（可选）
 */
export async function createTarget(req: CreateIscsiTargetRequest): Promise<IscsiTargetResult> {
  // 检查 Target 是否已存在
  const existing = await listTargets();
  if (existing.some(t => t.iqn === req.iqn)) {
    throw AppError.conflict(`iSCSI Target ${req.iqn} 已存在`);
  }

  // 为每个 LUN 创建后端存储对象
  const backstoreNames: string[] = [];
  for (let i = 0; i < req.luns.length; i++) {
    const lun = req.luns[i]!;
    const name = `${req.iqn.split(':').pop() ?? 'lun'}_lun${i}`;

    if (isBlockDevice(lun.backingStore)) {
      await targetcli(`/backstores/block create ${name} ${lun.backingStore}`);
    } else {
      const sizeMb = Math.ceil((lun.sizeBytes ?? 1073741824) / (1024 * 1024));
      await targetcli(`/backstores/fileio create ${name} ${lun.backingStore} ${sizeMb}M`);
    }
    backstoreNames.push(name);
  }

  // 创建 iSCSI Target
  await targetcli(`/iscsi create ${req.iqn}`);

  // 创建 LUN 映射
  for (let i = 0; i < backstoreNames.length; i++) {
    const bsName = backstoreNames[i]!;
    const bsType = isBlockDevice(req.luns[i]!.backingStore) ? 'block' : 'fileio';
    await targetcli(`/iscsi/${req.iqn}/tpg1/luns create /backstores/${bsType}/${bsName}`);
  }

  // 配置 CHAP 认证
  if (req.chapUser && req.chapPassword) {
    await targetcli(`/iscsi/${req.iqn}/tpg1 set attribute authentication=1`);
    await targetcli(`/iscsi/${req.iqn}/tpg1 set attribute userid=${req.chapUser}`);
    await targetcli(`/iscsi/${req.iqn}/tpg1 set attribute password=${req.chapPassword}`);
  }

  // 配置 Initiator 白名单
  if (req.initiatorWhitelist && req.initiatorWhitelist.length > 0) {
    await targetcli(`/iscsi/${req.iqn}/tpg1 set attribute generate_node_acls=0`);
    await targetcli(`/iscsi/${req.iqn}/tpg1 set attribute demo_mode_write_protect=0`);
    for (const initiator of req.initiatorWhitelist) {
      await targetcli(`/iscsi/${req.iqn}/tpg1/acls create ${initiator}`);
    }
  } else {
    // 默认允许所有 initiator
    await targetcli(`/iscsi/${req.iqn}/tpg1 set attribute generate_node_acls=1`);
  }

  return {
    iqn: req.iqn,
    message: `iSCSI Target 创建成功: ${req.iqn} (${req.luns.length} 个 LUN)`,
  };
}

/**
 * 列出所有 iSCSI Target
 * 解析 targetcli /iscsi ls 输出
 */
export async function listTargets(): Promise<IscsiTargetInfo[]> {
  const output = await targetcli('/iscsi ls');
  const targets: IscsiTargetInfo[] = [];

  // 解析 targetcli 输出格式:
  // o- iscsi .................................................. [Targets: 1]
  //   o- iqn.2026-07.com.vibeos:storage1 ..................... [TPGs: 1]
  //     o- tpg1 ............................................... [no-gen-acls, no-auth]
  const iqnRegex = /o- (iqn\.\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = iqnRegex.exec(output)) !== null) {
    const iqn = match[1]!;
    const detail = await getTargetDetail(iqn);
    targets.push(detail);
  }

  return targets;
}

/**
 * 获取单个 iSCSI Target 详情
 */
export async function getTargetDetail(iqn: string): Promise<IscsiTargetInfo> {
  // 获取 Target 详细信息
  const output = await targetcli(`/iscsi/${iqn}/tpg1 ls`);

  // 解析 LUN 列表
  const luns: IscsiLunInfo[] = [];
  const lunRegex = /o- lun(\d+) \.\.+ \[([^\]]+)\] \((\S+) (\S+)\)/g;
  let lunMatch: RegExpExecArray | null;
  while ((lunMatch = lunRegex.exec(output)) !== null) {
    const lunId = parseInt(lunMatch[1]!, 10);
    const storageType = lunMatch[3] ?? 'fileio';
    const backingStore = lunMatch[4] ?? '';

    // 获取 LUN 大小
    let sizeBytes = 0;
    try {
      const bsOutput = await targetcli(`/backstores/${storageType}/${backingStore.split('/').pop()} ls`);
      const sizeMatch = bsOutput.match(/(\d+)M/);
      if (sizeMatch) sizeBytes = parseInt(sizeMatch[1]!, 10) * 1024 * 1024;
    } catch {
      // 忽略大小查询失败
    }

    luns.push({ lunId, backingStore, sizeBytes, storageType });
  }

  // 解析 CHAP 状态
  const chapEnabled = output.includes('auth') && !output.includes('no-auth');
  const chapUserMatch = output.match(/userid=(\S+)/);

  // 解析连接数（从 sessions 获取）
  let connections = 0;
  try {
    const sessOutput = await targetcli(`/iscsi/${iqn}/tpg1/sessions ls`);
    const sessMatches = sessOutput.match(/o- session/g);
    connections = sessMatches?.length ?? 0;
  } catch {
    // 无会话
  }

  // 解析 ACL
  const initiatorWhitelist: string[] = [];
  const aclRegex = /o- (iqn\.\S+) \.\.+ \[Mapped LUNs/g;
  let aclMatch: RegExpExecArray | null;
  while ((aclMatch = aclRegex.exec(output)) !== null) {
    initiatorWhitelist.push(aclMatch[1]!);
  }

  return {
    iqn,
    luns,
    connections,
    chapEnabled,
    chapUser: chapUserMatch?.[1],
    initiatorWhitelist,
    tpg: 1,
  };
}

/**
 * 删除 iSCSI Target
 */
export async function deleteTarget(iqn: string): Promise<IscsiTargetResult> {
  // 检查是否存在
  const existing = await listTargets();
  if (!existing.some(t => t.iqn === iqn)) {
    throw AppError.notFound(`iSCSI Target ${iqn}`);
  }

  await targetcli(`/iscsi delete ${iqn}`);

  return {
    iqn,
    message: `iSCSI Target 已删除: ${iqn}`,
  };
}

/**
 * 添加 LUN 到现有 Target
 */
export async function addLun(iqn: string, req: AddLunRequest): Promise<IscsiTargetResult> {
  // 检查 Target 是否存在
  const existing = await listTargets();
  const target = existing.find(t => t.iqn === iqn);
  if (!target) {
    throw AppError.notFound(`iSCSI Target ${iqn}`);
  }

  const lunId = target.luns.length;
  const name = `${iqn.split(':').pop() ?? 'lun'}_lun${lunId}`;

  // 创建后端存储
  if (isBlockDevice(req.backingStore)) {
    await targetcli(`/backstores/block create ${name} ${req.backingStore}`);
    await targetcli(`/iscsi/${iqn}/tpg1/luns create /backstores/block/${name}`);
  } else {
    const sizeMb = Math.ceil((req.sizeBytes ?? 1073741824) / (1024 * 1024));
    await targetcli(`/backstores/fileio create ${name} ${req.backingStore} ${sizeMb}M`);
    await targetcli(`/iscsi/${iqn}/tpg1/luns create /backstores/fileio/${name}`);
  }

  return {
    iqn,
    message: `LUN ${lunId} 已添加到 ${iqn} (${req.backingStore})`,
  };
}

/**
 * 从 Target 移除 LUN
 */
export async function removeLun(iqn: string, lunId: number): Promise<IscsiTargetResult> {
  // 检查 Target 是否存在
  const existing = await listTargets();
  const target = existing.find(t => t.iqn === iqn);
  if (!target) {
    throw AppError.notFound(`iSCSI Target ${iqn}`);
  }

  const lun = target.luns.find(l => l.lunId === lunId);
  if (!lun) {
    throw AppError.notFound(`LUN ${lunId} (Target: ${iqn})`);
  }

  // 删除 LUN 映射
  await targetcli(`/iscsi/${iqn}/tpg1/luns delete lun${lunId}`);

  // 删除后端存储对象
  const bsName = lun.backingStore.split('/').pop() ?? '';
  try {
    await targetcli(`/backstores/${lun.storageType} delete ${bsName}`);
  } catch {
    // 后端存储删除失败不阻塞
  }

  return {
    iqn,
    message: `LUN ${lunId} 已从 ${iqn} 移除`,
  };
}
