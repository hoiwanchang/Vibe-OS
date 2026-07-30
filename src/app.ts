/**
 * Vibe OS 后端服务 — Express 应用入口
 * 组装所有模块路由、中间件、错误处理
 */
import express from 'express';
import { authMiddleware } from './common/auth-middleware.js';
import { errorHandler } from './common/error-handler.js';
import { systemInitRoutes } from './modules/system-init/index.js';
import { hardwareRoutes } from './modules/hardware/index.js';
import { containerRoutes } from './modules/container/index.js';
import { metricsRoutes } from './modules/metrics/index.js';
import { userRoutes } from './modules/user/index.js';
import { filemanagerRoutes } from './modules/filemanager/index.js';
import { storageRoutes } from './modules/storage/index.js';
import { sharingRoutes } from './modules/sharing/index.js';
import { backupRoutes } from './modules/backup/index.js';
import { downloadRoutes } from './modules/download/index.js';
import { networkRoutes } from './modules/network/index.js';
import { notificationRoutes } from './modules/notification/index.js';
import { schedulerRoutes } from './modules/scheduler/index.js';
import { appsRoutes } from './modules/apps/index.js';
import { settingsRoutes } from './modules/settings/index.js';

/**
 * 创建并配置 Express 应用实例
 * @returns 配置完成的 Express 应用
 */
export function createApp(): express.Express {
  const app = express();

  // 基础中间件
  app.use(express.json());

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

  // API 认证（所有 /api/ 路由）
  app.use('/api', authMiddleware);

  // 模块路由
  app.use('/api', systemInitRoutes);
  app.use('/api', hardwareRoutes);
  app.use('/api', containerRoutes);
  app.use('/api', metricsRoutes);
  app.use('/api', userRoutes);
  app.use('/api', filemanagerRoutes);
  app.use('/api', storageRoutes);
  app.use('/api', sharingRoutes);
  app.use('/api', backupRoutes);
  app.use('/api', downloadRoutes);
  app.use('/api', networkRoutes);
  app.use('/api', notificationRoutes);
  app.use('/api', schedulerRoutes);
  app.use('/api', appsRoutes);
  app.use('/api', settingsRoutes);

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
