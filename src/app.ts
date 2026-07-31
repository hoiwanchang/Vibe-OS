/**
 * Vibe OS 后端服务 — Express 应用入口
 * 组装所有模块路由、中间件、错误处理
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import { authGuard } from './common/auth-middleware.js';
import { sessionMiddleware } from './common/session-middleware.js';
import { errorHandler } from './common/error-handler.js';
import { systemInitRoutes } from './modules/system-init/index.js';
import { hardwareRoutes } from './modules/hardware/index.js';
import { containerRoutes } from './modules/container/index.js';
import { metricsRoutes } from './modules/metrics/index.js';
import { userRoutes } from './modules/user/index.js';
import { filemanagerRoutes } from './modules/filemanager/index.js';
import { fileversionRoutes } from './modules/fileversion/index.js';
import { searchRoutes } from './modules/search/index.js';
import { storageRoutes } from './modules/storage/index.js';
import { sharingRoutes } from './modules/sharing/index.js';
import { backupRoutes } from './modules/backup/index.js';
import { downloadRoutes } from './modules/download/index.js';
import { networkRoutes } from './modules/network/index.js';
import { notificationRoutes } from './modules/notification/index.js';
import { schedulerRoutes } from './modules/scheduler/index.js';
import { appsRoutes } from './modules/apps/index.js';
import { settingsRoutes } from './modules/settings/index.js';
import { proxyRoutes } from './modules/proxy/index.js';
import { ddnsRoutes } from './modules/ddns/index.js';
import { ftpRoutes } from './modules/ftp/index.js';
import { securityRoutes } from './modules/security/index.js';
import { authRoutes } from './modules/auth/index.js';
import { oidcPublicRoutes, oidcProtectedRoutes } from './modules/oidc/index.js';
import { oauthClientRoutes } from './modules/oauth-clients/index.js';
import { auditRoutes, auditMiddleware } from './modules/audit/index.js';
import { luksRoutes } from './modules/luks/index.js';
import { ssdCacheRoutes } from './modules/ssd-cache/index.js';
import { iscsiRoutes } from './modules/iscsi/index.js';
import { mediaRoutes } from './modules/media/index.js';
import { transcodeRoutes } from './modules/transcode/index.js';
import { musicRoutes } from './modules/music/index.js';
import { photosRoutes } from './modules/photos/index.js';
import { vlanRoutes } from './modules/vlan/index.js';
import { lacpRoutes } from './modules/lacp/index.js';
import { qosRoutes } from './modules/qos/index.js';
import { dnsRoutes } from './modules/dns/index.js';
import { vpnRoutes } from './modules/vpn/index.js';

/**
 * 创建并配置 Express 应用实例
 * @returns 配置完成的 Express 应用
 */
export function createApp(): express.Express {
  const app = express();

  // 基础中间件
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // 会话解析（不拦截，仅挂载 req.session / req.user）
  app.use(sessionMiddleware);

  // 审计日志中间件（记录所有 /api/ 请求）
  app.use(auditMiddleware);

  // 健康检查（无需认证）
  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        service: 'vibeos-backend',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ===== 公开路由（不经过 authGuard） =====
  // OIDC 发现 + 公开端点
  app.use(oidcPublicRoutes);
  // 认证路由（login 公开，logout/me/change-password 需要 session 但不需要 authGuard）
  app.use('/api', authRoutes);

  // ===== 受保护路由 =====
  app.use('/api', authGuard);

  // OIDC 受保护端点（userinfo/revoke/introspect 需要 Bearer token）
  app.use(oidcProtectedRoutes);

  // OAuth 客户端管理（需要 admin）
  app.use('/api', oauthClientRoutes);

  // 业务模块路由
  app.use('/api', systemInitRoutes);
  app.use('/api', hardwareRoutes);
  app.use('/api', containerRoutes);
  app.use('/api', metricsRoutes);
  app.use('/api', userRoutes);
  app.use('/api', filemanagerRoutes);
  app.use('/api', fileversionRoutes);
  app.use('/api', searchRoutes);
  app.use('/api', storageRoutes);
  app.use('/api', sharingRoutes);
  app.use('/api', backupRoutes);
  app.use('/api', downloadRoutes);
  app.use('/api', networkRoutes);
  app.use('/api', notificationRoutes);
  app.use('/api', schedulerRoutes);
  app.use('/api', appsRoutes);
  app.use('/api', settingsRoutes);
  app.use('/api', proxyRoutes);
  app.use('/api', ddnsRoutes);
  app.use('/api', ftpRoutes);
  app.use('/api', securityRoutes);
  app.use('/api', luksRoutes);
  app.use('/api', ssdCacheRoutes);
  app.use('/api', iscsiRoutes);
  app.use('/api', mediaRoutes);
  app.use('/api', transcodeRoutes);
  app.use('/api', musicRoutes);
  app.use('/api', photosRoutes);
  app.use('/api', vlanRoutes);
  app.use('/api', lacpRoutes);
  app.use('/api', qosRoutes);
  app.use('/api', dnsRoutes);
  app.use('/api', vpnRoutes);
  app.use('/api', auditRoutes);

  // 404 处理
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: '接口不存在' },
    });
  });

  // 统一错误处理
  app.use(errorHandler);

  return app;
}
