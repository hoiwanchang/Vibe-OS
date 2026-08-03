/**
 * 模块：系统设置中心 — 业务逻辑
 * 配置持久化到 /data/vibeos/settings/system.json
 * 系统命令通过 execFile 封装调用
 */
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve, normalize } from 'node:path';
import { promisify } from 'node:util';
import { VIBEOS_APP_DIR, COMMAND_TIMEOUT_MS, SSH_TARGET_USER } from '../../config.js';
import { AppError } from '../../common/app-error.js';
import { APP_VERSION } from '../../common/version.js';
import {
  getCertStatus,
  generateSelfSignedCert,
  importCert,
  removeCert,
  type CertStatus,
  type CertInfo,
} from '../../system/tls.js';
import {
  listAuthorizedKeys,
  importPublicKey,
  removePublicKey,
  generateKeyPair,
  type SshPublicKey,
  type GeneratedSshKey,
} from '../../system/ssh-keys.js';
import type {
  AboutInfo,
  LogLine,
  LogSource,
  ManagedService,
  SettingsSection,
  SystemSettings,
} from './settings.types.js';

const execFileAsync = promisify(execFile);

const SETTINGS_DIR = join(VIBEOS_APP_DIR, 'settings');
const SETTINGS_FILE = join(SETTINGS_DIR, 'system.json');
const AUDIT_LOG = join(VIBEOS_APP_DIR, 'logs', 'settings-audit.log');

/* ---------- 默认配置 ---------- */

function defaultSettings(): SystemSettings {
  return {
    general: {
      hostname: 'vibeos-node',
      timezone: 'Asia/Shanghai',
      locale: 'zh-CN',
      ntpEnabled: true,
      ntpServer: 'ntp.aliyun.com',
      description: 'Vibe OS 私有 AI NAS',
    },
    security: {
      httpsEnabled: false,
      httpsPort: 443,
      httpsCertPath: `${VIBEOS_APP_DIR}/certs/server.crt`,
      httpsKeyPath: `${VIBEOS_APP_DIR}/certs/server.key`,
      sshEnabled: true,
      sshPort: 22,
      sshPasswordAuth: false,
      maxLoginAttempts: 5,
      lockoutMinutes: 30,
      ipBlacklist: [],
      ipWhitelist: [],
      firewallEnabled: true,
      autoSecurityUpdates: true,
    },
    storage: {
      diskSpindownMinutes: 30,
      hddStandbyEnabled: true,
      smartCheckInterval: 24,
      smartEmailAlert: true,
      trashRetentionDays: 30,
      autoDefrag: false,
      writeCache: 'enabled',
    },
    power: {
      upsEnabled: false,
      upsDevice: '/dev/usb/hiddev0',
      upsShutdownThreshold: 15,
      scheduledPowerOn: { enabled: false, time: '07:00' },
      scheduledShutdown: { enabled: false, time: '23:00' },
      idleShutdown: { enabled: false, minutes: 120 },
      wakeOnLan: true,
    },
    notification: {
      channels: [],
      globalMinSeverity: 'info',
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    },
    update: {
      autoCheck: true,
      autoInstall: false,
      channel: 'stable',
      lastCheck: null,
      currentVersion: APP_VERSION,
    },
  };
}

/* ---------- 持久化 ---------- */

async function ensureDir(): Promise<void> {
  await mkdir(SETTINGS_DIR, { recursive: true });
  await mkdir(join(VIBEOS_APP_DIR, 'logs'), { recursive: true });
}

/** 读取完整配置（不存在则从默认值生成） */
export async function loadSettings(): Promise<SystemSettings> {
  await ensureDir();
  try {
    await access(SETTINGS_FILE);
    const raw = await readFile(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SystemSettings>;
    // 合并默认值，防止旧配置缺字段
    const defaults = defaultSettings();
    return {
      general: { ...defaults.general, ...parsed.general },
      security: { ...defaults.security, ...parsed.security },
      storage: { ...defaults.storage, ...parsed.storage },
      power: { ...defaults.power, ...parsed.power },
      notification: { ...defaults.notification, ...parsed.notification },
      update: { ...defaults.update, ...parsed.update },
    };
  } catch {
    const defaults = defaultSettings();
    await saveSettings(defaults);
    return defaults;
  }
}

/** 写入完整配置 */
export async function saveSettings(settings: SystemSettings): Promise<void> {
  await ensureDir();
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

/** 审计日志 */
async function auditLog(action: string, detail: string): Promise<void> {
  try {
    const { appendFile } = await import('node:fs/promises');
    const line = `${new Date().toISOString()} [SETTINGS] ${action}: ${detail}\n`;
    await appendFile(AUDIT_LOG, line, 'utf-8');
  } catch {
    /* 审计日志写入失败不阻塞主流程 */
  }
}

/* ---------- 读取单个 section ---------- */

export async function getSection(
  section: SettingsSection,
): Promise<SystemSettings[SettingsSection]> {
  const settings = await loadSettings();
  return settings[section];
}

/* ---------- 更新单个 section ---------- */

export async function updateSection(
  section: SettingsSection,
  data: Record<string, unknown>,
): Promise<{ updated: string; applied: boolean }> {
  const settings = await loadSettings();
  const current = settings[section] as unknown as Record<string, unknown>;
  const merged = { ...current, ...data };
  (settings as unknown as Record<string, unknown>)[section] = merged;
  await saveSettings(settings);
  await auditLog('UPDATE', `section=${section} keys=${Object.keys(data).join(',')}`);

  // Side-effects
  let applied = true;
  if (section === 'general') {
    applied = await applyGeneralSideEffects(
      merged as unknown as SystemSettings['general'],
    );
  }

  return { updated: section, applied };
}

/** 常规设置的系统级 side-effect */
async function applyGeneralSideEffects(
  general: SystemSettings['general'],
): Promise<boolean> {
  try {
    if (general.hostname) {
      await execFileAsync(
        'hostnamectl',
        ['set-hostname', general.hostname],
        { timeout: COMMAND_TIMEOUT_MS },
      );
    }
    if (general.timezone) {
      await execFileAsync(
        'timedatectl',
        ['set-timezone', general.timezone],
        { timeout: COMMAND_TIMEOUT_MS },
      );
    }
    if (typeof general.ntpEnabled === 'boolean') {
      await execFileAsync(
        'timedatectl',
        ['set-ntp', general.ntpEnabled ? 'true' : 'false'],
        { timeout: COMMAND_TIMEOUT_MS },
      );
    }
    return true;
  } catch {
    return false;
  }
}

/* ---------- 服务管理 ---------- */

/** 受管服务清单 */
const SERVICE_REGISTRY: Array<{
  name: string;
  displayName: string;
  description: string;
}> = [
  { name: 'ssh', displayName: 'SSH 远程访问', description: 'OpenSSH Server' },
  { name: 'smbd', displayName: 'SMB 文件共享', description: 'Samba' },
  { name: 'nfs-server', displayName: 'NFS 文件共享', description: 'NFS Kernel Server' },
  { name: 'docker', displayName: 'Docker 引擎', description: 'Docker CE' },
  { name: 'tailscaled', displayName: 'Tailscale', description: 'Tailscale Daemon' },
  { name: 'vsftpd', displayName: 'FTP 服务', description: 'vsftpd' },
  { name: 'nginx', displayName: 'Nginx 反代', description: 'Nginx' },
  { name: 'smartd', displayName: 'SMART 监控', description: 'smartmontools' },
];

async function systemctlIsEnabled(name: string): Promise<boolean> {
  try {
    await execFileAsync('systemctl', ['is-enabled', name], {
      timeout: COMMAND_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

async function systemctlIsActive(name: string): Promise<boolean> {
  try {
    await execFileAsync('systemctl', ['is-active', name], {
      timeout: COMMAND_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

async function getServicePid(name: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      'systemctl',
      ['show', name, '--property=MainPID', '--value'],
      { timeout: COMMAND_TIMEOUT_MS },
    );
    const pid = parseInt(stdout.trim(), 10);
    return pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export async function listServices(): Promise<ManagedService[]> {
  const results: ManagedService[] = [];
  for (const reg of SERVICE_REGISTRY) {
    const [enabled, running, pid] = await Promise.all([
      systemctlIsEnabled(reg.name),
      systemctlIsActive(reg.name),
      getServicePid(reg.name),
    ]);
    results.push({
      ...reg,
      enabled,
      running,
      pid,
      uptime: null,
    });
  }
  return results;
}

export async function toggleService(
  name: string,
  enabled: boolean,
): Promise<{ name: string; enabled: boolean; running: boolean }> {
  const valid = SERVICE_REGISTRY.some((s) => s.name === name);
  if (!valid) throw AppError.notFound(`服务 ${name}`);

  const args = enabled
    ? ['enable', '--now', name]
    : ['disable', '--now', name];
  try {
    await execFileAsync('systemctl', args, { timeout: COMMAND_TIMEOUT_MS });
  } catch (err) {
    throw AppError.commandFailed(
      'systemctl',
      err instanceof Error ? err.message : String(err),
    );
  }
  await auditLog('SERVICE_TOGGLE', `${name} → ${enabled ? 'enabled' : 'disabled'}`);

  const running = await systemctlIsActive(name);
  return { name, enabled, running };
}

export async function restartService(
  name: string,
): Promise<{ name: string; running: boolean; pid: number | null }> {
  const valid = SERVICE_REGISTRY.some((s) => s.name === name);
  if (!valid) throw AppError.notFound(`服务 ${name}`);

  try {
    await execFileAsync('systemctl', ['restart', name], {
      timeout: COMMAND_TIMEOUT_MS,
    });
  } catch (err) {
    throw AppError.commandFailed(
      'systemctl',
      err instanceof Error ? err.message : String(err),
    );
  }
  await auditLog('SERVICE_RESTART', name);

  const running = await systemctlIsActive(name);
  const pid = await getServicePid(name);
  return { name, running, pid };
}

/* ---------- 日志 ---------- */

const LOG_SOURCES: LogSource[] = [
  { id: 'system', name: '系统日志', description: 'journalctl 系统日志', sizeBytes: 0 },
  { id: 'auth', name: '认证日志', description: 'SSH / PAM 认证记录', sizeBytes: 0 },
  { id: 'vibeos', name: 'Vibe OS 日志', description: 'Vibe OS 后端服务日志', sizeBytes: 0 },
  { id: 'docker', name: 'Docker 日志', description: 'Docker 引擎日志', sizeBytes: 0 },
  { id: 'smartd', name: 'SMART 日志', description: '磁盘健康监控日志', sizeBytes: 0 },
];

export function getLogSources(): LogSource[] {
  return LOG_SOURCES;
}

export async function readLogs(
  source: string,
  lines: number,
  level?: string,
): Promise<{ lines: LogLine[]; total: number; source: string }> {
  const validSource = LOG_SOURCES.some((s) => s.id === source);
  if (!validSource) throw AppError.notFound(`日志源 ${source}`);

  const clampedLines = Math.min(Math.max(lines, 10), 1000);

  try {
    let args: string[];
    switch (source) {
      case 'system':
        args = ['-n', String(clampedLines), '--no-pager', '-o', 'json'];
        break;
      case 'auth':
        args = ['-n', String(clampedLines), '--no-pager', '-o', 'json', '-t', 'sshd', '-t', 'sudo', '-t', 'login'];
        break;
      case 'docker':
        args = ['-n', String(clampedLines), '--no-pager', '-o', 'json', '-u', 'docker'];
        break;
      case 'smartd':
        args = ['-n', String(clampedLines), '--no-pager', '-o', 'json', '-u', 'smartd'];
        break;
      default:
        // vibeos: 读取本地日志文件
        return await readNaisysLogs(clampedLines, level);
    }

    const { stdout } = await execFileAsync('journalctl', args, {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });

    const parsed: LogLine[] = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          const j = JSON.parse(line) as Record<string, string>;
          return {
            timestamp: j['__REALTIME_TIMESTAMP']
              ? new Date(Number(j['__REALTIME_TIMESTAMP']) / 1000).toISOString()
              : new Date().toISOString(),
            level: 'info' as const,
            source,
            message: j['MESSAGE'] ?? line,
          };
        } catch {
          return {
            timestamp: new Date().toISOString(),
            level: 'info' as const,
            source,
            message: line,
          };
        }
      });

    const filtered = level
      ? parsed.filter((l) => l.level === level)
      : parsed;

    return { lines: filtered, total: filtered.length, source };
  } catch {
    return { lines: [], total: 0, source };
  }
}

async function readNaisysLogs(
  lines: number,
  level?: string,
): Promise<{ lines: LogLine[]; total: number; source: string }> {
  try {
    const logDir = join(VIBEOS_APP_DIR, 'logs');
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(logDir);
    const logFiles = files.filter((f) => f.endsWith('.log'));
    const allLines: LogLine[] = [];

    for (const file of logFiles.slice(0, 5)) {
      const content = await readFile(join(logDir, file), 'utf-8');
      for (const raw of content.trim().split('\n').slice(-lines)) {
        const match = raw.match(
          /^(\S+)\s+\[(\w+)]\s+(.*)$/,
        );
        if (match) {
          allLines.push({
            timestamp: match[1] ?? new Date().toISOString(),
            level: (match[2]?.toLowerCase() ?? 'info') as LogLine['level'],
            source: 'vibeos',
            message: match[3] ?? raw,
          });
        } else if (raw.trim()) {
          allLines.push({
            timestamp: new Date().toISOString(),
            level: 'info',
            source: 'vibeos',
            message: raw,
          });
        }
      }
    }

    const filtered = level
      ? allLines.filter((l) => l.level === level)
      : allLines;
    const sliced = filtered.slice(-lines);
    return { lines: sliced, total: filtered.length, source: 'vibeos' };
  } catch {
    return { lines: [], total: 0, source: 'vibeos' };
  }
}

export async function clearLogs(source: string): Promise<{ cleared: string }> {
  const validSource = LOG_SOURCES.some((s) => s.id === source);
  if (!validSource) throw AppError.notFound(`日志源 ${source}`);
  await auditLog('LOG_CLEAR', source);
  // 实际清空操作需要 root 权限，此处仅记录审计
  return { cleared: source };
}

export async function exportDiagnostics(): Promise<{
  path: string;
  sizeBytes: number;
}> {
  const tmpDir = join(VIBEOS_APP_DIR, 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const outPath = join(tmpDir, `diagnostics-${Date.now()}.tar.gz`);

  try {
    await execFileAsync(
      'tar',
      [
        '-czf',
        outPath,
        '-C',
        VIBEOS_APP_DIR,
        'settings',
        'logs',
      ],
      { timeout: COMMAND_TIMEOUT_MS },
    );
    const { stat } = await import('node:fs/promises');
    const info = await stat(outPath);
    return { path: outPath, sizeBytes: info.size };
  } catch (err) {
    throw AppError.commandFailed(
      'tar',
      err instanceof Error ? err.message : String(err),
    );
  }
}

/* ---------- 关于 ---------- */

export async function getAbout(): Promise<AboutInfo> {
  const settings = await loadSettings();
  let hostname = settings.general.hostname;
  let kernel = 'unknown';
  const osVersion = 'Debian 13 (Trixie)';
  let cpuModel = 'unknown';
  let cpuCores = 0;
  let totalMemoryBytes = 0;
  let uptimeSeconds = 0;

  try {
    const { stdout: hn } = await execFileAsync('hostname', [], {
      timeout: COMMAND_TIMEOUT_MS,
    });
    hostname = hn.trim();
  } catch { /* fallback */ }

  try {
    const { stdout } = await execFileAsync('uname', ['-r'], {
      timeout: COMMAND_TIMEOUT_MS,
    });
    kernel = stdout.trim();
  } catch { /* fallback */ }

  try {
    const os = await import('node:os');
    cpuModel = os.cpus()[0]?.model ?? 'unknown';
    cpuCores = os.cpus().length;
    totalMemoryBytes = os.totalmem();
    uptimeSeconds = Math.floor(os.uptime());
  } catch { /* fallback */ }

  return {
    version: settings.update.currentVersion,
    buildDate: '2026-07-27',
    nodeVersion: process.version,
    osVersion,
    kernel,
    cpuModel,
    cpuCores,
    totalMemoryBytes,
    hostname,
    uptimeSeconds,
    dataRoot: VIBEOS_APP_DIR.replace('/vibeos', ''),
    license: 'MIT',
  };
}

/* ---------- 更新 ---------- */

export async function checkUpdate(): Promise<{
  updateAvailable: boolean;
  latestVersion?: string;
  changelog?: string;
}> {
  const settings = await loadSettings();
  settings.update.lastCheck = new Date().toISOString();
  await saveSettings(settings);
  await auditLog('UPDATE_CHECK', `channel=${settings.update.channel}`);

  // 离线环境：检查本地升级包目录
  try {
    const updateDir = join(VIBEOS_APP_DIR, 'update');
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(updateDir);
    const packages = files.filter(
      (f) => f.endsWith('.tar.gz') || f.endsWith('.deb'),
    );
    if (packages.length > 0) {
      return {
        updateAvailable: true,
        latestVersion: packages[0]?.replace(/\.(tar\.gz|deb)$/, '') ?? 'unknown',
        changelog: `发现 ${packages.length} 个本地升级包`,
      };
    }
  } catch {
    /* 目录不存在 */
  }

  return { updateAvailable: false };
}

/* ---------- 通知测试 ---------- */

export async function testNotification(
  channelType: string,
): Promise<{ sent: boolean; error?: string }> {
  const settings = await loadSettings();
  const channel = settings.notification.channels.find(
    (c) => c.type === channelType && c.enabled,
  );
  if (!channel) {
    return { sent: false, error: `未找到已启用的 ${channelType} 渠道` };
  }

  if (channel.type === 'webhook' && channel.url) {
    try {
      const res = await fetch(channel.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[Vibe OS 测试通知] ${new Date().toISOString()}`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      return { sent: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (err) {
      return {
        sent: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { sent: false, error: '暂不支持的渠道类型' };
}

/* ---------- TLS 证书管理 ---------- */

/** 证书文件合法根目录（防路径穿越） */
const CERTS_DIR = join(VIBEOS_APP_DIR, 'certs');

/**
 * 校验证书/私钥路径必须落在 CERTS_DIR 内
 * @throws AppError 当路径越界时
 */
function assertCertPath(p: string): void {
  const resolved = resolve(normalize(p));
  if (!resolved.startsWith(resolve(CERTS_DIR) + '/') && resolved !== resolve(CERTS_DIR)) {
    throw AppError.badRequest(
      'PATH_TRAVERSAL',
      `证书路径必须位于 ${CERTS_DIR} 之内`,
    );
  }
}

/** GET 证书状态（读取 settings 中配置的 cert/key 路径） */
export async function getCertificateStatus(): Promise<CertStatus> {
  const settings = await loadSettings();
  const { httpsCertPath, httpsKeyPath } = settings.security;
  return getCertStatus(httpsCertPath, httpsKeyPath);
}

/** 生成自签证书（写入 settings 配置的路径） */
export async function generateCertificate(opts: {
  commonName: string;
  sans: string[];
  days: number;
  keySize: 2048 | 4096;
}): Promise<CertInfo> {
  const settings = await loadSettings();
  const certPath = settings.security.httpsCertPath;
  const keyPath = settings.security.httpsKeyPath;
  assertCertPath(certPath);
  assertCertPath(keyPath);

  const info = await generateSelfSignedCert({
    certPath,
    keyPath,
    commonName: opts.commonName,
    sans: opts.sans,
    days: opts.days,
    keySize: opts.keySize,
  });
  await auditLog(
    'CERT_GENERATE',
    `CN=${opts.commonName} SANs=${opts.sans.join(',')} days=${opts.days}`,
  );
  return info;
}

/** 导入外部证书 + 私钥 */
export async function importCertificate(opts: {
  certPem: string;
  keyPem: string;
}): Promise<CertInfo> {
  const settings = await loadSettings();
  const certPath = settings.security.httpsCertPath;
  const keyPath = settings.security.httpsKeyPath;
  assertCertPath(certPath);
  assertCertPath(keyPath);

  const info = await importCert({
    certPath,
    keyPath,
    certPem: opts.certPem,
    keyPem: opts.keyPem,
  });
  await auditLog('CERT_IMPORT', `subject=${info.subject}`);
  return info;
}

/** 删除证书与私钥 */
export async function deleteCertificate(): Promise<{ removed: boolean }> {
  const settings = await loadSettings();
  const certPath = settings.security.httpsCertPath;
  const keyPath = settings.security.httpsKeyPath;
  assertCertPath(certPath);
  assertCertPath(keyPath);

  const result = await removeCert(certPath, keyPath);
  await auditLog('CERT_DELETE', `cert=${certPath}`);
  return result;
}

/* ---------- SSH 密钥管理 ---------- */

/**
 * 解析 authorized_keys 文件路径
 * 优先使用环境变量覆盖（测试 / 自定义部署），否则按目标用户家目录解析。
 * 注意：env 在调用时读取（而非模块加载时），否则测试在 beforeAll 中
 * 设置的环境变量会因 config 常量提前求值而失效。
 */
function resolveAuthorizedKeysPath(): string {
  const override = process.env['VIBEOS_SSH_AUTHORIZED_KEYS_FILE'];
  if (override) {
    return resolve(normalize(override));
  }
  const user = process.env['VIBEOS_SSH_TARGET_USER'] ?? SSH_TARGET_USER;
  return resolve(`/home/${user}/.ssh/authorized_keys`);
}

/** 列举 authorized_keys 公钥 */
export async function getSshKeys(): Promise<{
  keys: SshPublicKey[];
  targetUser: string;
  keysFile: string;
}> {
  const keysFile = resolveAuthorizedKeysPath();
  const keys = await listAuthorizedKeys(keysFile);
  return { keys, targetUser: SSH_TARGET_USER, keysFile };
}

/** 导入公钥 */
export async function importSshKey(publicKey: string): Promise<SshPublicKey> {
  const keysFile = resolveAuthorizedKeysPath();
  const key = await importPublicKey(keysFile, publicKey);
  await auditLog('SSH_KEY_IMPORT', `fingerprint=${key.fingerprint} type=${key.type}`);
  return key;
}

/** 删除公钥（按指纹） */
export async function deleteSshKey(
  fingerprint: string,
): Promise<{ removed: boolean }> {
  const keysFile = resolveAuthorizedKeysPath();
  const result = await removePublicKey(keysFile, fingerprint);
  await auditLog('SSH_KEY_DELETE', `fingerprint=${fingerprint} removed=${result.removed}`);
  return result;
}

/** 生成密钥对（私钥仅返回一次），公钥自动加入 authorized_keys */
export async function generateSshKey(opts: {
  type: 'ed25519' | 'rsa';
  bits?: 2048 | 4096;
  comment?: string;
}): Promise<GeneratedSshKey> {
  const key = await generateKeyPair(opts);
  // 自动将公钥加入授权列表，使生成的私钥可立即用于免密登录
  const keysFile = resolveAuthorizedKeysPath();
  await importPublicKey(keysFile, key.publicKey);
  await auditLog('SSH_KEY_GENERATE', `type=${key.type} fingerprint=${key.fingerprint}`);
  return key;
}

/* ---------- 系统电源 ---------- */

export async function systemReboot(): Promise<{ rebooting: boolean }> {
  await auditLog('SYSTEM_REBOOT', '用户触发重启');
  try {
    await execFileAsync('systemctl', ['reboot'], {
      timeout: 5000,
    });
    return { rebooting: true };
  } catch {
    return { rebooting: false };
  }
}

export async function systemShutdown(): Promise<{ shuttingDown: boolean }> {
  await auditLog('SYSTEM_SHUTDOWN', '用户触发关机');
  try {
    await execFileAsync('systemctl', ['poweroff'], {
      timeout: 5000,
    });
    return { shuttingDown: true };
  } catch {
    return { shuttingDown: false };
  }
}
