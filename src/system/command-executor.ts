/**
 * 原子化命令执行器
 * 所有系统命令必须通过此模块执行，禁止业务代码直接 exec/spawn
 * 安全约束：命令白名单 + 超时控制 + 参数转义
 */
import { execFile } from 'node:child_process';
import { COMMAND_TIMEOUT_MS } from '../config.js';
import { AppError } from '../common/app-error.js';

/** 命令执行结果 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** 允许执行的命令白名单 */
const ALLOWED_COMMANDS = new Set([
  'smartctl',
  'ethtool',
  'lsblk',
  'df',
  'du',
  'ip',
  'lspci',
  'lsmod',
  'modinfo',
  'docker',
  'tailscale',
  'stat',
  'id',
  'getent',
  'setquota',
  'repquota',
  'quota',
  // 存储池管理
  'mdadm',
  'mkfs.ext4',
  'mkfs.xfs',
  'mount',
  'umount',
  'blkid',
  'wipefs',
  // 共享文件夹
  'smbcontrol',
  'testparm',
  'exportfs',
  'showmount',
  'smbstatus',
  'systemctl',
  // 备份
  'rsync',
  'btrfs',
  'zfs',
  'tar',
  // 网络
  'nft',
  'iptables',
  'ss',
  'ethtool',
  'wakeonlan',
  // 下载
  'aria2c',
  // 计划任务
  'bash',
  // FTP/SFTP 日志
  'journalctl',
]);

/**
 * 执行系统命令（安全封装）
 * @param command - 命令名（必须在白名单内）
 * @param args - 参数数组（自动转义，无 shell 注入风险）
 * @param timeoutMs - 超时时间（毫秒）
 * @returns 命令执行结果
 * @throws AppError 命令不在白名单或执行失败
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  timeoutMs: number = COMMAND_TIMEOUT_MS,
): Promise<CommandResult> {
  if (!ALLOWED_COMMANDS.has(command)) {
    throw AppError.forbidden(`命令 [${command}] 不在允许列表中`);
  }

  return new Promise<CommandResult>((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && error.killed) {
          reject(
            AppError.commandFailed(command, `执行超时 (${timeoutMs}ms)`),
          );
          return;
        }

        const errWithCode = error as (NodeJS.ErrnoException & { code?: number | string }) | null;
        const exitCode = errWithCode && typeof errWithCode.code === 'number' ? errWithCode.code : (error ? 1 : 0);

        // 非零退出码不一定代表失败（如 smartctl 对某些磁盘返回非零）
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode,
        });
      },
    );
  });
}

/**
 * 执行命令并要求成功（exitCode === 0）
 * @throws AppError 命令执行失败
 */
export async function executeCommandStrict(
  command: string,
  args: string[] = [],
  timeoutMs?: number,
): Promise<CommandResult> {
  const result = await executeCommand(command, args, timeoutMs);
  if (result.exitCode !== 0) {
    throw AppError.commandFailed(
      command,
      result.stderr || `退出码 ${result.exitCode}`,
    );
  }
  return result;
}
