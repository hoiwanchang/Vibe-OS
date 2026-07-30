# 任务书：内置 OIDC Provider（统一身份认证中心）

> 本文件是 Hermes Agent 的完整开发任务指令。读取后直接执行，无需额外上下文。
> 目标：为 Vibe OS 实现完整的 OpenID Connect Provider，使 NAS 成为统一身份源，所有托管应用通过 SSO 登录。

---

## 0. 项目约束（强制，违反即无效）

- 项目根目录：`/mnt/d/Kane/OrcaWorkSpaces/Vibe-OS`
- 先读 `AGENTS.md`，所有安全红线、目录规范、交付标准必须遵守
- 技术栈锁定：Express 5 + TypeScript strict + Vue 3 + Vite + Element Plus + Pinia + pnpm monorepo
- 数据目录：`/data/vibeos/`，密钥存 `/data/vibeos/secrets/`（0700）
- 禁止外网依赖：OIDC Provider 完全本地运行，不依赖任何外部 IdP
- 禁止 root 运行，服务用户 `vibeos`
- 环境变量前缀：`VIBEOS_`
- 开发数据目录：`VIBEOS_DATA_ROOT=/tmp/vibeos-data`
- 迭代流水线：`pnpm lint → pnpm build → pnpm test`，不通过自行修复，5 轮上限
- 测试覆盖率 ≥ 80%，禁止删测试凑通过
- 提交规范：Conventional Commits，功能分支 `feat/oidc-provider`

---

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vibe OS 前端 (Vue 3)                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │ 登录页   │  │ 用户同意页   │  │ 设置中心 > 安全 > 客户端  │  │
│  └────┬─────┘  └──────┬───────┘  └─────────────┬─────────────┘  │
└───────┼────────────────┼────────────────────────┼────────────────┘
        │                │                        │
┌───────▼────────────────▼────────────────────────▼────────────────┐
│                     Express 5 后端                                │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  auth 模块（本地账号）                                       │ │
│  │  POST /api/auth/login          密码登录（bcrypt）            │ │
│  │  POST /api/auth/logout         登出                          │ │
│  │  GET  /api/auth/me             当前会话用户                  │ │
│  │  POST /api/auth/change-password 修改密码                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  oidc 模块（OIDC Provider 核心）                             │ │
│  │  GET  /.well-known/openid-configuration   发现端点          │ │
│  │  GET  /oidc/jwks.json                     JWKS 公钥集       │ │
│  │  GET  /oidc/authorize                     授权端点          │ │
│  │  POST /oidc/token                         令牌端点          │ │
│  │  GET  /oidc/userinfo                      用户信息端点      │ │
│  │  POST /oidc/revoke                        令牌撤销          │ │
│  │  POST /oidc/introspect                    令牌内省          │ │
│  │  GET  /oidc/end-session                   登出端点          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  oauth-clients 模块（客户端管理）                            │ │
│  │  GET    /api/oauth/clients              列表                │ │
│  │  POST   /api/oauth/clients              注册                │ │
│  │  GET    /api/oauth/clients/:id          详情                │ │
│  │  PUT    /api/oauth/clients/:id          更新                │ │
│  │  DELETE /api/oauth/clients/:id          删除                │ │
│  │  POST   /api/oauth/clients/:id/reset-secret  重置密钥      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  认证中间件链                                                │ │
│  │  sessionMiddleware → authGuard → routeHandler               │ │
│  │  支持：Session Cookie（Web UI）+ Bearer Token（API）        │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
        │
┌───────▼───────────────────────────────────────────────────────────┐
│  持久化层（JSON 文件，/data/vibeos/）                              │
│  auth/users.json          用户账号（uid, username, passwordHash） │
│  auth/sessions/           活跃会话（sid → uid + expiry）          │
│  oidc/clients.json        注册的 OAuth 客户端                     │
│  oidc/codes/              授权码（code → uid + client + scope）   │
│  oidc/tokens/             刷新令牌（jti → uid + client + scope）  │
│  secrets/oidc-keys.json   RSA 密钥对（签名 JWT，0700）            │
└───────────────────────────────────────────────────────────────────┘
```

---

## 2. 后端实现（按顺序）

### 2.1 auth 模块 — 本地账号认证

目录：`src/modules/auth/`

```
auth.types.ts        类型定义
auth.dao.ts          持久化（users.json 读写、session 管理）
auth.service.ts      业务逻辑（注册/登录/登出/改密/会话校验）
auth.controller.ts   请求处理
auth.routes.ts       路由
index.ts             导出
__tests__/auth.test.ts
```

要求：
- 密码哈希：`bcrypt`（cost 12），禁止明文存储
- 会话：服务端 session（JSON 文件），cookie `vibeos.sid`，httpOnly + sameSite=strict + secure（生产）
- 会话有效期 24h，支持主动登出销毁
- 登录失败 5 次锁定 15 分钟（IP + 用户名维度）
- 初始管理员账号：首次启动时若 users.json 为空，自动创建 `admin`，密码从 `VIBEOS_ADMIN_PASSWORD` 环境变量读取（默认 `vibeos`），强制首次登录改密
- 用户与现有 `/data/{uid}/` 数据目录体系对接：auth 用户 = 系统用户，uid 复用 user 模块的分配逻辑
- 认证中间件重构：替换现有 `auth-middleware.ts` 的静态 token 方案
  - 优先检查 session cookie（Web UI）
  - 其次检查 `Authorization: Bearer <access_token>`（API / OIDC token）
  - 开发模式（`VIBEOS_AUTH_DISABLED=true`）跳过认证
  - 保留 `VIBEOS_API_TOKEN` 作为紧急后门（运维用），但标记 deprecated

### 2.2 oidc 模块 — OIDC Provider 核心

目录：`src/modules/oidc/`

```
oidc.types.ts          类型（ClientMetadata, TokenPayload, AuthCode 等）
oidc.keys.ts           RSA 密钥管理（生成/加载/轮换，存 secrets/oidc-keys.json）
oidc.dao.ts            持久化（clients.json, codes/, tokens/）
oidc.service.ts        核心逻辑（授权/发码/换 token/验签/userinfo/revoke/introspect）
oidc.controller.ts     请求处理
oidc.routes.ts         路由（注意：/.well-known 和 /oidc 路径不经过 authGuard）
index.ts
__tests__/oidc.test.ts
```

OIDC 规范要求（必须全部实现）：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/.well-known/openid-configuration` | GET | 标准发现文档，issuer = `http://<host>:3000` |
| `/oidc/jwks.json` | GET | RSA 公钥集（kid 标识） |
| `/oidc/authorize` | GET | 授权端点：校验 client_id + redirect_uri + scope + response_type=code + PKCE（code_challenge_method=S256）；已登录则渲染同意页，未登录重定向到登录页 |
| `/oidc/token` | POST | 令牌端点：authorization_code 换 token（校验 PKCE verifier）；refresh_token 刷新；client_credentials（M2M） |
| `/oidc/userinfo` | GET | Bearer access_token → 用户 claims（sub, name, email, uid, groups） |
| `/oidc/revoke` | POST | 撤销 access_token 或 refresh_token（RFC 7009） |
| `/oidc/introspect` | POST | 令牌内省（RFC 7662），返回 active + metadata |
| `/oidc/end-session` | GET/POST | RP-Initiated Logout，清除 session，重定向 post_logout_redirect_uri |

Token 规范：
- Access Token：JWT（RS256），有效期 1h，claims: iss, sub, aud, exp, iat, jti, scope, uid, username
- ID Token：JWT（RS256），有效期 1h，claims: iss, sub, aud, exp, iat, auth_time, nonce, name, email
- Refresh Token：不透明字符串（crypto.randomUUID），有效期 30d，单次使用（rotation）
- 授权码：不透明字符串，有效期 10min，单次使用
- PKCE：仅支持 S256，不支持 plain

安全要求：
- redirect_uri 精确匹配（白名单，注册时录入）
- state 参数防 CSRF（客户端负责，服务端透传）
- scope 支持：`openid`（必须）、`profile`、`email`、`groups`、`offline_access`
- 密钥轮换：支持多 kid 并存，JWKS 返回所有有效公钥，旧 kid 保留 7 天
- 速率限制：/oidc/token 每 IP 每分钟 30 次

### 2.3 oauth-clients 模块 — 客户端管理

目录：`src/modules/oauth-clients/`

```
oauth-clients.types.ts
oauth-clients.dao.ts
oauth-clients.service.ts
oauth-clients.controller.ts
oauth-clients.routes.ts
index.ts
__tests__/oauth-clients.test.ts
```

客户端注册数据结构：
```typescript
interface OAuthClient {
  id: string;                    // client_id（nanoid 21 位）
  secret: string;                // client_secret（bcrypt hash 存储）
  name: string;                  // 显示名称（如 "Nextcloud"）
  redirectUris: string[];        // 允许的回调地址（精确匹配）
  postLogoutRedirectUris: string[];
  scopes: string[];              // 允许的 scope 子集
  grantTypes: ('authorization_code' | 'refresh_token' | 'client_credentials')[];
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
}
```

要求：
- 注册时自动生成 client_id + client_secret，secret 仅在创建/重置时明文返回一次
- 管理接口需要 admin 权限（session 用户 role=admin）
- 预置客户端：首次启动自动注册 Vibe OS Web UI 自身（用于未来前端 OIDC 登录）

### 2.4 中间件重构

修改 `src/common/auth-middleware.ts`：

```typescript
// 新的认证链：
// 1. VIBEOS_AUTH_DISABLED=true → 跳过（开发模式）
// 2. VIBEOS_API_TOKEN 匹配 → 通过（deprecated 后门）
// 3. Session cookie 有效 → 通过，req.user = session 用户
// 4. Bearer token 有效（OIDC access_token 验签）→ 通过，req.user = token claims
// 5. 以上都不满足 → 401
```

新增 `src/common/session-middleware.ts`：
- 解析 `vibeos.sid` cookie
- 从 `/data/vibeos/auth/sessions/` 加载会话
- 挂载 `req.session` 和 `req.user`

新增 `src/common/rbac.ts`：
- 角色：`admin` | `user`
- 装饰器/中间件：`requireRole('admin')`
- 首个注册用户自动 admin

### 2.5 app.ts 路由注册

```typescript
// 公开路由（不经过 authGuard）
app.use(oidcDiscoveryRoutes);     // /.well-known/openid-configuration
app.use(oidcPublicRoutes);        // /oidc/jwks, /oidc/authorize, /oidc/token, /oidc/end-session
app.use(authRoutes);              // /api/auth/login, /api/auth/logout

// 受保护路由
app.use('/api', authGuard);
app.use('/api', oauthClientRoutes);  // 客户端管理（admin）
app.use('/api', oidcProtectedRoutes); // /oidc/userinfo, /oidc/revoke, /oidc/introspect
// ... 现有模块路由
```

---

## 3. 前端实现

### 3.1 登录页

文件：`web/src/views/LoginView.vue`

- 全屏黑底 + 居中登录卡片（琥珀工业风，与现有设计一致）
- 用户名 + 密码输入框，登录按钮
- 错误提示（账号锁定、密码错误）
- 首次登录强制改密弹窗
- 登录成功后跳转桌面（`/`）
- 支持 URL 参数 `?redirect=/oidc/authorize?...`（OIDC 授权流程中未登录时跳来）

### 3.2 用户同意页

文件：`web/src/views/ConsentView.vue`

- OIDC 授权流程中，用户已登录但客户端首次请求时展示
- 显示：客户端名称 + logo、请求的 scope 列表（人类可读描述）、redirect_uri
- 按钮：「授权」「拒绝」
- 授权后重定向回 `/oidc/authorize` 带 `consent=approved`
- 拒绝后重定向回 redirect_uri 带 `error=access_denied`

### 3.3 客户端管理面板

文件：`web/src/components/settings/OAuthClients.vue`

- 嵌入设置中心 > 安全 分区（或新增"应用授权"分区）
- 客户端列表表格：名称、client_id、scope、状态、创建时间
- 操作：注册新客户端、编辑、禁用/启用、重置 secret、删除
- 注册对话框：名称、redirect_uris（多行）、scope 多选、grant_type 多选
- 重置 secret 后弹窗显示新 secret（仅一次，关闭后不可再查看）

### 3.4 路由与状态

- `web/src/router/` 新增 `/login`、`/consent` 路由（不在 WebOS 窗口内，全屏页面）
- `web/src/stores/auth.ts`：Pinia store，管理 currentUser、isLoggedIn、login()、logout()
- 前端 API 拦截器：401 时自动跳转 `/login?redirect=当前路径`
- WebOS 桌面（DesktopView）加登录守卫：未登录 → 重定向 `/login`

### 3.5 任务栏用户菜单

- 任务栏右侧加用户头像/名称
- 下拉菜单：修改密码、登出
- 登出后清除 session，跳转登录页

---

## 4. 与现有系统集成

### 4.1 应用中心对接

修改 `src/modules/apps/`：
- 应用部署时可选"启用 SSO"
- 启用后自动注册 OAuth 客户端（redirect_uri = 应用地址 + `/oauth/callback`）
- 应用卡片显示"SSO 已启用"标识

### 4.2 用户模块对接

修改 `src/modules/user/`：
- 用户创建时同步写入 `auth/users.json`（默认密码 = 随机生成，需管理员重置或用户首次设置）
- 用户删除时同步清理 auth 记录和活跃 session

### 4.3 设置中心对接

- 安全分区新增：密码策略（最小长度、复杂度）、会话有效期、登录失败锁定策略
- 新增"应用授权"分区：OAuth 客户端管理（3.3 的面板）

---

## 5. 测试要求

### 5.1 单元测试（Vitest + Supertest）

| 模块 | 最低用例数 | 覆盖重点 |
|------|-----------|----------|
| auth | 20+ | 登录/登出/改密/锁定/会话过期/首次初始化 |
| oidc | 30+ | 发现文档/JWKS/授权码流程/PKCE/token 刷新/revoke/introspect/userinfo/过期/重放 |
| oauth-clients | 15+ | CRUD/secret 重置/权限校验/预置客户端 |
| 中间件 | 10+ | session/bearer/开发模式/角色守卫 |

### 5.2 集成测试

- 完整 OIDC 授权码流程 E2E：注册客户端 → 授权 → 同意 → 换 token → userinfo → 刷新 → 撤销
- PKCE 校验：错误 verifier 必须拒绝
- 多客户端隔离：client A 的 token 不能访问 client B 的资源

### 5.3 安全测试

- 授权码重放（第二次使用必须失败）
- refresh token rotation（旧 token 立即失效）
- redirect_uri 篡改（必须拒绝）
- 暴力破解锁定（5 次后 423）
- JWT 过期/篡改签名（必须 401）

---

## 6. 交付清单

| 产物 | 要求 |
|------|------|
| 后端模块 | auth + oidc + oauth-clients，`pnpm build` 零错误 |
| 前端页面 | LoginView + ConsentView + OAuthClients 面板，`pnpm web:build` 零错误 |
| 测试 | `pnpm test` 全通过，覆盖率 ≥ 80% |
| OpenAPI | `docs/api/openapi.yaml` 更新，包含所有新端点 |
| 文档 | README 更新认证章节；`docs/oidc-integration-guide.md`（第三方应用接入指南） |
| 提交 | `feat/oidc-provider` 分支，Conventional Commits |

---

## 7. 执行顺序（建议）

```
Phase 1: auth 模块（本地账号 + session + 中间件重构）
  → 前端登录页 + 路由守卫
  → 验证：能登录/登出/改密，未登录跳登录页

Phase 2: oidc 模块（发现/JWKS/authorize/token/userinfo）
  → 前端同意页
  → 验证：curl 跑通完整授权码流程

Phase 3: oauth-clients 模块 + 前端管理面板
  → 验证：注册客户端 → 用该客户端跑授权流程

Phase 4: 集成（应用中心 SSO、用户模块同步、设置中心）
  → 验证：部署 Nextcloud 时自动注册 SSO

Phase 5: 安全加固 + 全量测试 + 文档
  → pnpm lint && build && test 全绿
  → 提交 PR
```

---

## 8. 依赖（允许新增）

| 包 | 用途 | 安装位置 |
|---|---|---|
| `bcrypt` | 密码哈希 | 后端 dependencies |
| `jose` | JWT 签名/验证/JWKS | 后端 dependencies |
| `nanoid` | client_id / 授权码生成 | 后端 dependencies |
| `cookie-parser` | Express cookie 解析 | 后端 dependencies |
| `express-rate-limit` | /oidc/token 速率限制 | 后端 dependencies |

前端不新增依赖（Element Plus 已有表单/表格/对话框组件）。

---

## 9. 注意事项

- `/.well-known/openid-configuration` 和 `/oidc/*` 公开端点不能经过 authGuard，否则第三方应用无法获取 JWKS
- issuer 必须与部署地址一致，开发环境 `http://127.0.0.1:3000`，生产环境从 `VIBEOS_ISSUER` 环境变量读取
- JWT 密钥首次启动自动生成（RSA 2048），存 `/data/vibeos/secrets/oidc-keys.json`，权限 0700
- 授权码和 refresh token 存文件系统时按过期时间自动清理（启动时 + 每小时 cron）
- 所有日志写入 `/data/vibeos/oidc/logs/`，禁止写 `/var/log/`
- 前端登录页和同意页是全屏路由，不在 WebOS 窗口框架内
- 现有 `VIBEOS_API_TOKEN` 保留为紧急后门，但日志中标记 `[DEPRECATED]`
