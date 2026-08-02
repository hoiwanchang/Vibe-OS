/**
 * Vibe OS 后端服务 — 启动入口
 * 仅在直接运行时启动 HTTP 服务器（测试时通过 createApp() 导入）
 */
import { createApp } from './app.js';
import { PORT, HOST } from './config.js';
import * as authService from './modules/auth/auth.service.js';
import * as oidcKeys from './modules/oidc/oidc.keys.js';
import * as oauthClientService from './modules/oauth-clients/oauth-clients.service.js';

const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`Vibe OS 后端服务已启动: http://${HOST}:${PORT}`);
});

// 初始化认证和 OIDC
await authService.initAuth();
await oidcKeys.ensureKeys();
await oauthClientService.initPresetClients();
console.log('[init] auth + OIDC keys + preset clients 就绪');
