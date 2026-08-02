/**
 * 模块：安装向导 — 类型定义
 */

/** 磁盘信息 */
export interface SetupDisk {
  name: string;
  size: string;
  model: string;
}

/** 安装完成请求 */
export interface SetupCompleteRequest {
  admin: {
    username: string;
    password: string;
    enable2fa: boolean;
  };
  storage: {
    disks: string[];
    poolType: 'single' | 'raid1' | 'raid5';
    filesystem: 'ext4' | 'btrfs' | 'xfs';
  };
  network: {
    method: 'dhcp' | 'static';
    ip?: string;
    netmask?: string;
    gateway?: string;
    dns?: string;
  };
  services: {
    smb: boolean;
    ftp: boolean;
    dlna: boolean;
    docker: boolean;
  };
}
