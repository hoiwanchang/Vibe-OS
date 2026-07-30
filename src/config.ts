/**
 * Vibe OS 全局配置
 * 所有配置项通过环境变量注入，禁止硬编码
 */

/** 数据根目录（唯一合法数据根） */
export const DATA_ROOT = process.env['VIBEOS_DATA_ROOT'] ?? '/data';

/** AI 系统应用目录 */
export const VIBEOS_APP_DIR = `${DATA_ROOT}/vibeos`;

/** 密钥存储目录（0700 权限） */
export const SECRETS_DIR = `${VIBEOS_APP_DIR}/secrets`;

/** 系统级缓存目录 */
export const SYSTEM_CACHE_DIR = `${VIBEOS_APP_DIR}/cache`;

/** 服务监听端口 */
export const PORT = parseInt(process.env['VIBEOS_PORT'] ?? '3000', 10);

/** 服务监听地址（默认仅本地） */
export const HOST = process.env['VIBEOS_HOST'] ?? '127.0.0.1';

/** API 认证 Token（生产环境必须设置） */
export const API_TOKEN = process.env['VIBEOS_API_TOKEN'] ?? '';

/** 命令执行超时（毫秒） */
export const COMMAND_TIMEOUT_MS = parseInt(
  process.env['VIBEOS_CMD_TIMEOUT'] ?? '30000',
  10,
);

/** SSH authorized_keys 管理目标用户（默认主用户，与安装介质一致） */
export const SSH_TARGET_USER =
  process.env['VIBEOS_SSH_TARGET_USER'] ?? 'vibeuser';

/** SSH authorized_keys 文件路径覆盖（测试 / 自定义部署用，留空则按目标用户解析） */
export const SSH_AUTHORIZED_KEYS_FILE =
  process.env['VIBEOS_SSH_AUTHORIZED_KEYS_FILE'] ?? '';

/** 用户默认配额（字节），默认 100GB */
export const DEFAULT_QUOTA_BYTES = BigInt(
  process.env['VIBEOS_DEFAULT_QUOTA'] ?? String(100 * 1024 * 1024 * 1024),
);

/** 用户目录子结构 */
export const USER_SUBDIRS = ['files', 'config', 'cache'] as const;

/** 应用目录子结构 */
export const APP_SUBDIRS = ['models', 'data', 'logs'] as const;

// ===== 认证与 OIDC 配置 =====

/** 开发模式：跳过认证 */
export const AUTH_DISABLED = process.env['VIBEOS_AUTH_DISABLED'] === 'true';

/** 初始管理员密码（首次启动时创建 admin 账号） */
export const ADMIN_PASSWORD = process.env['VIBEOS_ADMIN_PASSWORD'] ?? 'vibeos';

/** 会话有效期（毫秒），默认 24h */
export const SESSION_TTL_MS = parseInt(
  process.env['VIBEOS_SESSION_TTL'] ?? String(24 * 60 * 60 * 1000),
  10,
);

/** 登录失败锁定阈值（次数） */
export const LOGIN_MAX_ATTEMPTS = parseInt(
  process.env['VIBEOS_LOGIN_MAX_ATTEMPTS'] ?? '5',
  10,
);

/** 登录失败锁定时长（毫秒），默认 15min */
export const LOGIN_LOCK_MS = parseInt(
  process.env['VIBEOS_LOGIN_LOCK_MS'] ?? String(15 * 60 * 1000),
  10,
);

/** OIDC Issuer（发现文档中的 issuer 字段） */
export const OIDC_ISSUER =
  process.env['VIBEOS_ISSUER'] ?? `http://${HOST}:${PORT}`;

/** JWT Access Token 有效期（秒），默认 1h */
export const ACCESS_TOKEN_TTL_S = parseInt(
  process.env['VIBEOS_ACCESS_TOKEN_TTL'] ?? '3600',
  10,
);

/** Refresh Token 有效期（毫秒），默认 30d */
export const REFRESH_TOKEN_TTL_MS = parseInt(
  process.env['VIBEOS_REFRESH_TOKEN_TTL'] ?? String(30 * 24 * 60 * 60 * 1000),
  10,
);

/** 授权码有效期（毫秒），默认 10min */
export const AUTH_CODE_TTL_MS = parseInt(
  process.env['VIBEOS_AUTH_CODE_TTL'] ?? String(10 * 60 * 1000),
  10,
);

/** Cookie 名称 */
export const SESSION_COOKIE_NAME = 'vibeos.sid';

/** 生产环境标记（影响 cookie secure 属性） */
export const IS_PRODUCTION = process.env['NODE_ENV'] === 'production';
