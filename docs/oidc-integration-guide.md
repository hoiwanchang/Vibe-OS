# Vibe OS OIDC 集成指南

> 面向第三方应用开发者：如何将你的应用接入 Vibe OS 统一身份认证（SSO）。

## 概述

Vibe OS 内置完整的 OpenID Connect Provider，支持标准授权码流程 + PKCE。
所有托管应用可通过 SSO 登录，无需各自维护用户体系。

- Issuer: `http://<NAS_IP>:3000`（生产环境由 `VIBEOS_ISSUER` 决定）
- 协议: OpenID Connect 1.0 / OAuth 2.0
- 签名算法: RS256
- PKCE: 必须（仅 S256）

## 快速开始

### 1. 注册客户端

在 Vibe OS 管理界面：**设置中心 → 应用授权 → 注册客户端**

填写：
- 名称（如 "Nextcloud"）
- 回调地址（如 `http://nextcloud.local/oauth/callback`）
- Scope: `openid profile email`
- Grant Types: `authorization_code` + `refresh_token`

创建后会得到 `client_id` 和 `client_secret`（secret 仅显示一次）。

### 2. 发现端点

```bash
curl http://<NAS_IP>:3000/.well-known/openid-configuration
```

返回所有端点地址、支持的 scope、签名算法等。

### 3. 授权码流程

#### Step 1: 生成 PKCE

```python
import hashlib, base64, os

code_verifier = base64.urlsafe_b64encode(os.urandom(32)).rstrip(b'=').decode()
code_challenge = base64.urlsafe_b64encode(
    hashlib.sha256(code_verifier.encode()).digest()
).rstrip(b'=').decode()
```

#### Step 2: 重定向用户到授权端点

```
http://<NAS_IP>:3000/oidc/authorize?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=http://nextcloud.local/oauth/callback&
  scope=openid profile email&
  response_type=code&
  code_challenge=CHALLENGE&
  code_challenge_method=S256&
  state=RANDOM_STATE&
  nonce=RANDOM_NONCE
```

用户登录并同意后，浏览器重定向到：
```
http://nextcloud.local/oauth/callback?code=AUTH_CODE&state=RANDOM_STATE
```

#### Step 3: 用授权码换 Token

```bash
curl -X POST http://<NAS_IP>:3000/oidc/token \
  -d grant_type=authorization_code \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=*** \
  -d code=AUTH_CODE \
  -d redirect_uri=http://nextcloud.local/oauth/callback \
  -d code_verifier=CODE_VERIFIER
```

响应：
```json
{
  "access_token": "eyJhbG...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "eyJhbG...",
  "refresh_token": "a1b2c3...",
  "scope": "openid profile email"
}
```

#### Step 4: 获取用户信息

```bash
curl http://<NAS_IP>:3000/oidc/userinfo \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

响应：
```json
{
  "sub": "1000",
  "name": "admin",
  "email": "admin@vibeos.local",
  "uid": 1000,
  "username": "admin"
}
```

### 4. 刷新 Token

```bash
curl -X POST http://<NAS_IP>:3000/oidc/token \
  -d grant_type=refresh_token \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=*** \
  -d refresh_token=OLD_REFRESH_TOKEN
```

注意：Refresh Token 实行 rotation，旧 token 立即失效。

### 5. 登出

```
http://<NAS_IP>:3000/oidc/end-session?post_logout_redirect_uri=http://nextcloud.local/
```

## 各框架接入示例

### Nextcloud

在 `config.php` 中配置 `user_oidc` 应用：
```php
'oidc_provider_url' => 'http://<NAS_IP>:3000',
'oidc_client_id' => 'YOUR_CLIENT_ID',
'oidc_client_secret' => 'YOUR_SECRET',
'oidc_scope' => 'openid profile email',
```

### Gitea

`app.ini`:
```ini
[oauth2]
ENABLED = true

[service]
# 通过 Gitea 管理面板添加 OAuth2 源
# Provider: OpenID Connect
# Discovery URL: http://<NAS_IP>:3000/.well-known/openid-configuration
```

### 通用 Node.js (passport-openidconnect)

```javascript
const { Issuer, generators } = require('openid-client');

const issuer = await Issuer.discover('http://<NAS_IP>:3000');
const client = new issuer.Client({
  client_id: process.env.CLIENT_ID,
  client_secret: process.env.CLIENT_SECRET,
  redirect_uris: ['http://localhost:8080/callback'],
  response_types: ['code'],
});

// 生成授权 URL
const codeVerifier = generators.codeVerifier();
const codeChallenge = generators.codeChallenge(codeVerifier);
const authUrl = client.authorizationUrl({
  scope: 'openid profile email',
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
});
```

## 安全注意事项

1. **redirect_uri 必须精确匹配** — 注册时录入的 URI 与请求时必须完全一致
2. **PKCE 是强制的** — 不支持 plain 方法，仅 S256
3. **state 参数** — 客户端必须生成随机 state 防 CSRF
4. **secret 保管** — client_secret 仅在创建/重置时显示一次，丢失需重置
5. **Token 有效期** — Access Token 1h，Refresh Token 30d（rotation）
6. **速率限制** — /oidc/token 每 IP 每分钟 30 次

## 可用 Scope

| Scope | 说明 |
|-------|------|
| `openid` | 必须，返回 ID Token |
| `profile` | 用户名、显示名 |
| `email` | 邮箱地址 |
| `groups` | 用户组（预留） |
| `offline_access` | 获取 Refresh Token |

## 令牌内省与撤销

- 内省: `POST /oidc/introspect` (RFC 7662) — 验证 token 是否有效
- 撤销: `POST /oidc/revoke` (RFC 7009) — 主动废弃 token

## 故障排查

| 问题 | 原因 |
|------|------|
| `invalid_client` | client_id 不存在或已禁用 |
| `invalid_redirect` | redirect_uri 不在白名单 |
| `invalid_grant` | 授权码过期/已使用/PKCE 校验失败 |
| `access_denied` | 用户拒绝授权 |
| 401 on userinfo | Access Token 过期或签名无效 |
