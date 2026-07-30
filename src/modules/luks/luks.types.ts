/**
 * 模块：LUKS 卷加密 — 类型定义
 */

/** LUKS 卷状态信息（cryptsetup status 解析结果） */
export interface LuksVolumeStatus {
  /** 映射名称（/dev/mapper/<name>） */
  name: string;
  /** 底层块设备路径 */
  device: string;
  /** 是否处于活动（已解锁）状态 */
  active: boolean;
  /** LUKS 版本（luks1 / luks2） */
  type: string;
  /** 加密算法（如 aes-xts-plain64） */
  cipher: string;
  /** 密钥长度（如 512 bits） */
  keysize: string;
  /** 读写模式（如 read/write） */
  mode: string;
  /** 偏移量 */
  offset: string;
  /** 卷大小 */
  size: string;
}

/** keyfile 生成结果 */
export interface LuksKeyfileResult {
  /** 卷名标识 */
  name: string;
  /** keyfile 绝对路径 */
  path: string;
}
