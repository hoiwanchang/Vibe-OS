/**
 * Vibe OS 后端服务 — 启动入口
 * 仅在直接运行时启动 HTTP 服务器（测试时通过 createApp() 导入）
 */
import { createApp } from './app.js';
import { PORT, HOST } from './config.js';

const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`[Vibe OS] 服务已启动: http://${HOST}:${PORT}`);
  console.log(`[Vibe OS] 健康检查: http://${HOST}:${PORT}/api/health`);
});
