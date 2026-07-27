/**
 * 模块：共享文件夹 — 类型定义
 */
export interface ShareInfo {
  name: string;
  path: string;
  protocol: 'smb' | 'nfs' | 'webdav';
  readonly: boolean;
  validUsers: string[];
  hosts: string[];
  enabled: boolean;
  port?: number;
}

export interface ShareConnection {
  user: string;
  host: string;
  openedAt: string;
  files: number;
}
