/**
 * 模块：DLNA/UPnP 媒体服务器 — 业务逻辑层
 * 通过 minidlnad 命令管理 DLNA 服务
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AppError } from '../../common/app-error.js';
import { executeCommand, executeCommandStrict } from '../../system/command-executor.js';
import { ensureDir } from '../../system/filesystem.js';
import { VIBEOS_APP_DIR } from '../../config.js';
import type {
  MediaClient,
  MediaConfig,
  MediaConfigRequest,
  MediaResult,
  MediaStatus,
} from './media.types.js';

/** 媒体配置目录 */
const MEDIA_DIR = `${VIBEOS_APP_DIR}/media`;
/** minidlna 配置文件路径 */
const CONFIG_FILE = `${MEDIA_DIR}/minidlna.conf`;
/** 持久化 JSON 配置路径 */
const JSON_CONFIG_FILE = `${MEDIA_DIR}/config.json`;
/** minidlna 数据库目录 */
const DB_DIR = `${MEDIA_DIR}/db`;
/** minidlna 日志目录 */
const LOG_DIR = `${MEDIA_DIR}/log`;

/**
 * 生成 minidlna.conf 配置文件内容
 */
function generateConf(config: MediaConfig): string {
  const lines: string[] = [
    '# Vibe OS DLNA 配置 — 自动生成，请勿手动修改',
    `port=${config.port}`,
    `db_dir=${DB_DIR}`,
    `log_dir=${LOG_DIR}`,
    `inotify=${config.inotify ? 'yes' : 'no'}`,
    'friendly_name=Vibe OS Media Server',
    'model_name=Vibe OS',
    'serial=00000000',
    'model_number=1.0',
  ];

  for (const source of config.sources) {
    // minidlna media_dir 格式: 类型字母,路径
    // V=video, A=audio/music, P=photo
    const typeLetter = source.type === 'video' ? 'V' : source.type === 'music' ? 'A' : 'P';
    lines.push(`media_dir=${typeLetter},${source.path}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * 读取持久化 JSON 配置
 */
async function loadConfig(): Promise<MediaConfig | null> {
  try {
    const raw = await fs.readFile(JSON_CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as MediaConfig;
  } catch {
    return null;
  }
}

/**
 * 保存持久化 JSON 配置
 */
async function saveConfig(config: MediaConfig): Promise<void> {
  await ensureDir(MEDIA_DIR);
  await fs.writeFile(JSON_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 检测 minidlnad 进程是否运行中
 * @returns PID 或 null
 */
async function getProcessPid(): Promise<number | null> {
  const result = await executeCommand('pgrep', ['-f', 'minidlnad']);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return null;
  }
  const pid = parseInt(result.stdout.trim().split('\n')[0]!, 10);
  return isNaN(pid) ? null : pid;
}

/**
 * 统计媒体文件数量
 * 通过 minidlna 数据库目录中的文件计数估算
 */
async function countMediaFiles(config: MediaConfig): Promise<{ video: number; music: number; photo: number }> {
  let video = 0;
  let music = 0;
  let photo = 0;

  for (const source of config.sources) {
    try {
      const result = await executeCommand('bash', [
        '-c',
        `find '${source.path.replace(/'/g, "'\\''")}' -type f 2>/dev/null | wc -l`,
      ]);
      const count = parseInt(result.stdout.trim(), 10) || 0;
      if (source.type === 'video') video += count;
      else if (source.type === 'music') music += count;
      else photo += count;
    } catch {
      // 目录不可访问时跳过
    }
  }

  return { video, music, photo };
}

/**
 * 获取 DLNA 服务状态
 */
export async function getStatus(): Promise<MediaStatus> {
  const pid = await getProcessPid();
  const config = await loadConfig();

  let videoCount = 0;
  let musicCount = 0;
  let photoCount = 0;

  if (config) {
    const counts = await countMediaFiles(config);
    videoCount = counts.video;
    musicCount = counts.music;
    photoCount = counts.photo;
  }

  return {
    running: pid !== null,
    pid,
    videoCount,
    musicCount,
    photoCount,
    config,
  };
}

/**
 * 更新媒体库配置
 * 生成 minidlna.conf 并重启服务
 */
export async function updateConfig(req: MediaConfigRequest): Promise<MediaResult> {
  const config: MediaConfig = {
    sources: req.sources,
    inotify: req.inotify,
    port: req.port,
  };

  // 确保目录存在
  await ensureDir(MEDIA_DIR);
  await ensureDir(DB_DIR);
  await ensureDir(LOG_DIR);

  // 生成 minidlna.conf
  const confContent = generateConf(config);
  await fs.writeFile(CONFIG_FILE, confContent, 'utf-8');

  // 保存 JSON 配置
  await saveConfig(config);

  // 如果服务正在运行则重启
  const pid = await getProcessPid();
  if (pid !== null) {
    await executeCommand('kill', [String(pid)]);
    // 等待进程退出
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // 启动服务
  await executeCommandStrict('minidlnad', ['-f', CONFIG_FILE, '-P', `${MEDIA_DIR}/minidlna.pid`]);

  return {
    message: `媒体库配置已更新 (${req.sources.length} 个媒体源, 端口 ${req.port})`,
  };
}

/**
 * 触发重新扫描媒体库
 */
export async function rescan(): Promise<MediaResult> {
  const pid = await getProcessPid();

  if (pid !== null) {
    // 服务运行中：发送 HUP 信号触发重新扫描
    await executeCommandStrict('kill', ['-HUP', String(pid)]);
    return { message: '已触发媒体库重新扫描 (SIGHUP)' };
  }

  // 服务未运行：先启动再扫描
  const config = await loadConfig();
  if (!config) {
    throw AppError.badRequest('NO_CONFIG', '尚未配置媒体库，请先调用 PUT /api/media/config');
  }

  await ensureDir(DB_DIR);
  await ensureDir(LOG_DIR);
  await executeCommandStrict('minidlnad', ['-f', CONFIG_FILE, '-P', `${MEDIA_DIR}/minidlna.pid`, '-R']);

  return { message: '媒体服务已启动并执行全量扫描' };
}

/**
 * 获取已连接客户端列表
 * 解析 minidlna 日志中的客户端连接记录
 */
export async function getClients(): Promise<MediaClient[]> {
  const clients: MediaClient[] = [];

  try {
    // 从日志文件解析客户端连接
    const logFile = path.join(LOG_DIR, 'minidlna.log');
    const logContent = await fs.readFile(logFile, 'utf-8');

    // 匹配客户端连接日志行
    // 格式: [timestamp] clients.c:xxx: Client connected: IP=x.x.x.x, UA=xxx
    const clientRegex = /Client connected.*?IP=([\d.]+).*?(?:UA|DN)=([^\s,]+)/g;
    const seen = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = clientRegex.exec(logContent)) !== null) {
      const ip = match[1]!;
      const name = match[2]!;
      const key = `${ip}:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        clients.push({
          ip,
          name,
          connectedAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    // 日志不存在或不可读，返回空列表
  }

  return clients;
}
