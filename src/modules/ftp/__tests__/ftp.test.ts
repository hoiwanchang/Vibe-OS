/**
 * 模块：FTP/SFTP 服务管理 — 单元 + 集成测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* mock 系统命令执行器 */
vi.mock('../../../system/command-executor.js', () => ({
  executeCommand: vi.fn(),
  executeCommandStrict: vi.fn(),
}));

/* mock dao 层 */
vi.mock('../ftp.dao.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  loadUserPermissions: vi.fn(),
  saveUserPermissions: vi.fn(),
}));

import { executeCommand, executeCommandStrict } from '../../../system/command-executor.js';
import * as service from '../ftp.service.js';
import * as dao from '../ftp.dao.js';

const mockExec = vi.mocked(executeCommand);
const mockExecStrict = vi.mocked(executeCommandStrict);
const mockLoadConfig = vi.mocked(dao.loadConfig);
const mockSaveConfig = vi.mocked(dao.saveConfig);
const mockLoadUserPerms = vi.mocked(dao.loadUserPermissions);
const mockSaveUserPerms = vi.mocked(dao.saveUserPermissions);

const DEFAULT_FTP = {
  port: 21, passivePortMin: 30000, passivePortMax: 30100,
  anonymousAccess: false, tlsEnabled: false, tlsCertPath: '', tlsKeyPath: '',
};
const DEFAULT_SFTP = { enabled: true, chrootDirectory: '/data/%u' };

describe('FTP/SFTP 服务管理', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ---------- getStatus ---------- */

  describe('getStatus', () => {
    it('应返回 FTP 和 SFTP 运行状态', async () => {
      mockLoadConfig.mockResolvedValue({ ftp: { ...DEFAULT_FTP }, sftp: { ...DEFAULT_SFTP } });
      mockExec
        .mockResolvedValueOnce({ stdout: 'active\n', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'active\n', stderr: '', exitCode: 0 });

      const status = await service.getStatus();
      expect(status.ftpRunning).toBe(true);
      expect(status.sftpRunning).toBe(true);
    });

    it('服务未运行时应返回 false', async () => {
      mockLoadConfig.mockResolvedValue({ ftp: { ...DEFAULT_FTP }, sftp: { ...DEFAULT_SFTP } });
      mockExec
        .mockResolvedValueOnce({ stdout: 'inactive\n', stderr: '', exitCode: 3 })
        .mockResolvedValueOnce({ stdout: 'inactive\n', stderr: '', exitCode: 3 });

      const status = await service.getStatus();
      expect(status.ftpRunning).toBe(false);
      expect(status.sftpRunning).toBe(false);
    });
  });

  /* ---------- updateConfig ---------- */

  describe('updateConfig', () => {
    it('应合并更新配置并持久化', async () => {
      mockLoadConfig.mockResolvedValue({ ftp: { ...DEFAULT_FTP }, sftp: { ...DEFAULT_SFTP } });
      mockSaveConfig.mockResolvedValue(undefined);
      mockExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      const result = await service.updateConfig({ port: 2121 });
      expect(result.ftp.port).toBe(2121);
      expect(mockSaveConfig).toHaveBeenCalledOnce();
    });

    it('端口范围下限大于上限应报错', async () => {
      mockLoadConfig.mockResolvedValue({ ftp: { ...DEFAULT_FTP }, sftp: { ...DEFAULT_SFTP } });
      await expect(
        service.updateConfig({ passivePortMin: 40000, passivePortMax: 30000 }),
      ).rejects.toThrow('被动模式端口范围下限不能大于上限');
    });

    it('无效端口应报错', async () => {
      mockLoadConfig.mockResolvedValue({ ftp: { ...DEFAULT_FTP }, sftp: { ...DEFAULT_SFTP } });
      await expect(service.updateConfig({ port: 99999 })).rejects.toThrow('FTP 端口必须在 1-65535 之间');
    });
  });

  /* ---------- 服务控制 ---------- */

  describe('服务控制', () => {
    it('startFtp 应调用 systemctl start', async () => {
      mockExecStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const result = await service.startFtp();
      expect(result.action).toBe('start');
      expect(mockExecStrict).toHaveBeenCalledWith('systemctl', ['start', 'vsftpd']);
    });

    it('stopFtp 应调用 systemctl stop', async () => {
      mockExecStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const result = await service.stopFtp();
      expect(result.action).toBe('stop');
    });

    it('restartFtp 应调用 systemctl restart', async () => {
      mockExecStrict.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      const result = await service.restartFtp();
      expect(result.action).toBe('restart');
    });
  });

  /* ---------- getLogs ---------- */

  describe('getLogs', () => {
    it('应解析 journalctl 日志', async () => {
      mockExec.mockResolvedValue({
        stdout: '2026-07-31T10:00:00+0800 host vsftpd[123]: LOGIN: user admin\n2026-07-31T10:01:00+0800 host vsftpd[123]: UPLOAD: /files/test.txt\n',
        stderr: '',
        exitCode: 0,
      });

      const logs = await service.getLogs(10);
      expect(logs.length).toBe(2);
      expect(logs[0]?.action).toBe('login');
      expect(logs[1]?.action).toBe('upload');
    });

    it('命令失败时应返回空数组', async () => {
      mockExec.mockResolvedValue({ stdout: '', stderr: 'error', exitCode: 1 });
      const logs = await service.getLogs();
      expect(logs).toEqual([]);
    });
  });

  /* ---------- 用户权限 ---------- */

  describe('用户权限', () => {
    it('getUserPermission 无记录时返回默认权限', async () => {
      mockLoadUserPerms.mockResolvedValue({});
      const perm = await service.getUserPermission(1000);
      expect(perm.allowed).toBe(true);
      expect(perm.bandwidthLimitKbps).toBe(0);
    });

    it('updateUserPermission 应合并并持久化', async () => {
      mockLoadUserPerms.mockResolvedValue({});
      mockSaveUserPerms.mockResolvedValue(undefined);

      const perm = await service.updateUserPermission(1000, { allowed: false, bandwidthLimitKbps: 512 });
      expect(perm.allowed).toBe(false);
      expect(perm.bandwidthLimitKbps).toBe(512);
      expect(mockSaveUserPerms).toHaveBeenCalledOnce();
    });

    it('负带宽应报错', async () => {
      mockLoadUserPerms.mockResolvedValue({});
      await expect(
        service.updateUserPermission(1000, { bandwidthLimitKbps: -1 }),
      ).rejects.toThrow('带宽限制不能为负数');
    });
  });
});
