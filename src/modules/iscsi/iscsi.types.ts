/**
 * 模块：iSCSI Target 管理 — 类型定义
 * 基于 targetcli (Linux LIO) 实现 iSCSI Target 服务
 */

/** LUN 配置 */
export interface IscsiLunConfig {
  /** 后端存储路径（块设备或文件镜像） */
  backingStore: string;
  /** LUN 大小（字节，仅文件镜像时有效） */
  sizeBytes?: number;
}

/** 创建 iSCSI Target 请求 */
export interface CreateIscsiTargetRequest {
  /** IQN 名称（如 iqn.2026-07.com.vibeos:storage1） */
  iqn: string;
  /** LUN 列表 */
  luns: IscsiLunConfig[];
  /** CHAP 认证用户名（可选） */
  chapUser?: string;
  /** CHAP 认证密码（可选） */
  chapPassword?: string;
  /** 允许的 Initiator IQN 白名单（可选，空表示允许所有） */
  initiatorWhitelist?: string[];
}

/** LUN 信息 */
export interface IscsiLunInfo {
  /** LUN ID */
  lunId: number;
  /** 后端存储路径 */
  backingStore: string;
  /** 大小（字节） */
  sizeBytes: number;
  /** 存储对象类型（block / fileio） */
  storageType: string;
}

/** iSCSI Target 信息 */
export interface IscsiTargetInfo {
  /** IQN 名称 */
  iqn: string;
  /** LUN 列表 */
  luns: IscsiLunInfo[];
  /** 当前连接数 */
  connections: number;
  /** 是否启用 CHAP 认证 */
  chapEnabled: boolean;
  /** CHAP 用户名（启用时） */
  chapUser?: string;
  /** 允许的 Initiator 列表 */
  initiatorWhitelist: string[];
  /** TPG 编号 */
  tpg: number;
}

/** 添加 LUN 请求 */
export interface AddLunRequest {
  /** 后端存储路径 */
  backingStore: string;
  /** 大小（字节，仅文件镜像时有效） */
  sizeBytes?: number;
}

/** Target 操作结果 */
export interface IscsiTargetResult {
  /** IQN */
  iqn: string;
  /** 消息 */
  message: string;
}
