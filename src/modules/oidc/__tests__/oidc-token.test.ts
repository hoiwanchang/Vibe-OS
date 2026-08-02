/**
 * oidc token 流程测试（exchangeCode / refresh / introspect / revoke）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { generateKeyPair, importJWK } from 'jose';

const mockGetSigningKey = vi.fn();
const mockGetAllPublicKeys = vi.fn().mockResolvedValue([]);
vi.mock('../oidc.keys.js', () => ({
  getSigningKey: () => mockGetSigningKey(),
  getAllPublicKeys: () => mockGetAllPublicKeys(),
  getJwks: () => ({ keys: [] }),
}));

const mockFindClient = vi.fn().mockResolvedValue(null);
const mockLoadAuthCode = vi.fn().mockResolvedValue(null);
const mockMarkCodeUsed = vi.fn().mockResolvedValue(undefined);
const mockDeleteAuthCode = vi.fn().mockResolvedValue(undefined);
const mockSaveAuthCode = vi.fn().mockResolvedValue(undefined);
const mockFindRefreshToken = vi.fn().mockResolvedValue(null);
const mockSaveRefreshToken = vi.fn().mockResolvedValue(undefined);
const mockRevokeRefreshToken = vi.fn().mockResolvedValue(undefined);
vi.mock('../oidc.dao.js', () => ({
  findClient: (...a: unknown[]) => mockFindClient(...a),
  loadAuthCode: (...a: unknown[]) => mockLoadAuthCode(...a),
  markCodeUsed: (...a: unknown[]) => mockMarkCodeUsed(...a),
  deleteAuthCode: (...a: unknown[]) => mockDeleteAuthCode(...a),
  saveAuthCode: (...a: unknown[]) => mockSaveAuthCode(...a),
  findRefreshToken: (...a: unknown[]) => mockFindRefreshToken(...a),
  saveRefreshToken: (...a: unknown[]) => mockSaveRefreshToken(...a),
  revokeRefreshToken: (...a: unknown[]) => mockRevokeRefreshToken(...a),
}));

vi.mock('bcrypt', () => ({
  default: { compare: vi.fn().mockResolvedValue(true) },
}));

vi.mock('../../../config.js', () => ({
  ACCESS_TOKEN_TTL_S: 3600,
  AUTH_CODE_TTL_MS: 600000,
  OIDC_ISSUER: 'http://127.0.0.1:3000',
  REFRESH_TOKEN_TTL_MS: 2592000000,
  VIBEOS_APP_DIR: '/tmp/vibeos-data/vibeos',
  SECRETS_DIR: '/tmp/vibeos-data/vibeos/secrets',
}));

import * as service from '../oidc.service.js';

const testClient = {
  id: 'client-1', secretHash: '$2b$12$hash', name: 'Test App',
  redirectUris: ['http://localhost:3000/callback'],
  postLogoutRedirectUris: [], scopes: ['openid', 'profile'],
  grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'] as const,
  tokenEndpointAuthMethod: 'client_secret_basic' as const,
  createdAt: '2025-01-01', updatedAt: '2025-01-01', enabled: true,
};

let privateKey: Awaited<ReturnType<typeof importJWK>>;
let publicKey: Awaited<ReturnType<typeof importJWK>>;

describe('oidc token 流程', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const pair = await generateKeyPair('RS256', { extractable: true });
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
    mockGetSigningKey.mockReturnValue({ key: privateKey, kid: 'test-kid' });
    mockGetAllPublicKeys.mockResolvedValue([publicKey]);
  });

  describe('exchangeCode', () => {
    const verifier = 'my-code-verifier-string';
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    it('合法授权码应返回 token', async () => {
      mockLoadAuthCode.mockResolvedValue({
        code: 'abc', clientId: 'client-1', uid: 1000, username: 'admin',
        scope: 'openid profile', redirectUri: 'http://localhost:3000/callback',
        codeChallenge: challenge, nonce: 'n1', createdAt: Date.now(),
        expiresAt: Date.now() + 600000, used: false,
      });
      mockFindClient.mockResolvedValue(testClient);
      const result = await service.exchangeCode({
        code: 'abc', clientId: 'client-1', clientSecret: 'sec',
        redirectUri: 'http://localhost:3000/callback', codeVerifier: verifier,
      });
      expect(result.access_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
      expect(result.id_token).toBeDefined();
      expect(mockMarkCodeUsed).toHaveBeenCalledWith('abc');
    });

    it('授权码不存在应拒绝', async () => {
      mockLoadAuthCode.mockResolvedValue(null);
      await expect(service.exchangeCode({
        code: 'bad', clientId: 'c', redirectUri: 'r', codeVerifier: 'v',
      })).rejects.toThrow('授权码无效或已过期');
    });

    it('授权码已使用应拒绝（重放攻击）', async () => {
      mockLoadAuthCode.mockResolvedValue({
        code: 'abc', clientId: 'client-1', uid: 1000, username: 'admin',
        scope: 'openid', redirectUri: 'http://localhost:3000/callback',
        codeChallenge: challenge, createdAt: Date.now(),
        expiresAt: Date.now() + 600000, used: true,
      });
      await expect(service.exchangeCode({
        code: 'abc', clientId: 'client-1', redirectUri: 'http://localhost:3000/callback', codeVerifier: verifier,
      })).rejects.toThrow('授权码已被使用');
    });

    it('授权码过期应拒绝', async () => {
      mockLoadAuthCode.mockResolvedValue({
        code: 'abc', clientId: 'client-1', uid: 1000, username: 'admin',
        scope: 'openid', redirectUri: 'http://localhost:3000/callback',
        codeChallenge: challenge, createdAt: Date.now() - 999999,
        expiresAt: Date.now() - 1, used: false,
      });
      await expect(service.exchangeCode({
        code: 'abc', clientId: 'client-1', redirectUri: 'http://localhost:3000/callback', codeVerifier: verifier,
      })).rejects.toThrow('授权码已过期');
    });

    it('PKCE verifier 错误应拒绝', async () => {
      mockLoadAuthCode.mockResolvedValue({
        code: 'abc', clientId: 'client-1', uid: 1000, username: 'admin',
        scope: 'openid', redirectUri: 'http://localhost:3000/callback',
        codeChallenge: challenge, createdAt: Date.now(),
        expiresAt: Date.now() + 600000, used: false,
      });
      mockFindClient.mockResolvedValue(testClient);
      await expect(service.exchangeCode({
        code: 'abc', clientId: 'client-1', redirectUri: 'http://localhost:3000/callback',
        codeVerifier: 'wrong-verifier',
      })).rejects.toThrow('PKCE code_verifier 校验失败');
    });

    it('redirect_uri 不匹配应拒绝', async () => {
      mockLoadAuthCode.mockResolvedValue({
        code: 'abc', clientId: 'client-1', uid: 1000, username: 'admin',
        scope: 'openid', redirectUri: 'http://localhost:3000/callback',
        codeChallenge: challenge, createdAt: Date.now(),
        expiresAt: Date.now() + 600000, used: false,
      });
      await expect(service.exchangeCode({
        code: 'abc', clientId: 'client-1', redirectUri: 'http://evil.com', codeVerifier: verifier,
      })).rejects.toThrow('redirect_uri 不匹配');
    });
  });

  describe('refreshToken', () => {
    it('有效 refresh_token 应返回新 token 并撤销旧的', async () => {
      mockFindRefreshToken.mockResolvedValue({
        jti: 'jti-1', token: 'rt-1', clientId: 'client-1', uid: 1000,
        username: 'admin', scope: 'openid offline_access',
        createdAt: Date.now(), expiresAt: Date.now() + 999999, revoked: false,
      });
      mockFindClient.mockResolvedValue(testClient);
      const result = await service.refreshToken({
        refreshToken: 'rt-1', clientId: 'client-1', clientSecret: 'sec',
      });
      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(mockRevokeRefreshToken).toHaveBeenCalledWith('jti-1');
    });

    it('已撤销的 refresh_token 应拒绝', async () => {
      mockFindRefreshToken.mockResolvedValue({
        jti: 'jti-1', token: 'rt-1', clientId: 'client-1', uid: 1000,
        username: 'admin', scope: 'openid', createdAt: Date.now(),
        expiresAt: Date.now() + 999999, revoked: true,
      });
      await expect(service.refreshToken({
        refreshToken: 'rt-1', clientId: 'client-1',
      })).rejects.toThrow('refresh_token 已撤销');
    });

    it('过期的 refresh_token 应拒绝', async () => {
      mockFindRefreshToken.mockResolvedValue({
        jti: 'jti-1', token: 'rt-1', clientId: 'client-1', uid: 1000,
        username: 'admin', scope: 'openid', createdAt: Date.now() - 999999,
        expiresAt: Date.now() - 1, revoked: false,
      });
      await expect(service.refreshToken({
        refreshToken: 'rt-1', clientId: 'client-1',
      })).rejects.toThrow('refresh_token 已过期');
    });

    it('client_id 不匹配应拒绝', async () => {
      mockFindRefreshToken.mockResolvedValue({
        jti: 'jti-1', token: 'rt-1', clientId: 'client-1', uid: 1000,
        username: 'admin', scope: 'openid', createdAt: Date.now(),
        expiresAt: Date.now() + 999999, revoked: false,
      });
      await expect(service.refreshToken({
        refreshToken: 'rt-1', clientId: 'other-client',
      })).rejects.toThrow('client_id 不匹配');
    });
  });

  describe('clientCredentials', () => {
    it('合法 M2M 应返回 token', async () => {
      mockFindClient.mockResolvedValue(testClient);
      const result = await service.clientCredentials({
        clientId: 'client-1', clientSecret: 'sec', scope: 'openid',
      });
      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeUndefined();
    });

    it('未授权 client_credentials 应拒绝', async () => {
      mockFindClient.mockResolvedValue({ ...testClient, grantTypes: ['authorization_code'] });
      await expect(service.clientCredentials({
        clientId: 'client-1', clientSecret: 'sec', scope: 'openid',
      })).rejects.toThrow('未授权 client_credentials');
    });
  });

  describe('getUserInfo', () => {
    it('有效 token 应返回用户信息', async () => {
      // 先签发一个真实 JWT
      const { SignJWT } = await import('jose');
      const token = await new SignJWT({ scope: 'openid', uid: 1000, username: 'admin', role: 'admin' })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
        .setIssuer('http://127.0.0.1:3000')
        .setSubject('1000')
        .setAudience('client-1')
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .setIssuedAt()
        .sign(privateKey);
      const info = await service.getUserInfo(token);
      expect(info.sub).toBe('1000');
      expect(info.username).toBe('admin');
      expect(info.email).toBe('admin@vibeos.local');
    });

    it('无效 token 应 401', async () => {
      await expect(service.getUserInfo('invalid.jwt.token')).rejects.toThrow('access_token 无效或已过期');
    });
  });

  describe('revokeToken', () => {
    it('refresh_token 应撤销', async () => {
      mockFindRefreshToken.mockResolvedValue({ jti: 'jti-1', token: 'rt-1' });
      await service.revokeToken('rt-1');
      expect(mockRevokeRefreshToken).toHaveBeenCalledWith('jti-1');
    });

    it('未知 token 应静默成功', async () => {
      mockFindRefreshToken.mockResolvedValue(null);
      await expect(service.revokeToken('unknown')).resolves.toBeUndefined();
    });
  });

  describe('introspectToken', () => {
    it('有效 refresh_token 应返回 active', async () => {
      mockFindRefreshToken.mockResolvedValue({
        jti: 'jti-1', token: 'rt-1', clientId: 'client-1', uid: 1000,
        username: 'admin', scope: 'openid', createdAt: Date.now(),
        expiresAt: Date.now() + 999999, revoked: false,
      });
      const result = await service.introspectToken('rt-1');
      expect(result.active).toBe(true);
      expect(result.username).toBe('admin');
    });

    it('已撤销 refresh_token 应返回 inactive', async () => {
      mockFindRefreshToken.mockResolvedValue({
        jti: 'jti-1', token: 'rt-1', clientId: 'c', uid: 1,
        username: 'x', scope: 'openid', createdAt: Date.now(),
        expiresAt: Date.now() + 999999, revoked: true,
      });
      const result = await service.introspectToken('rt-1');
      expect(result.active).toBe(false);
    });

    it('无效 token 应返回 inactive', async () => {
      mockFindRefreshToken.mockResolvedValue(null);
      const result = await service.introspectToken('garbage');
      expect(result.active).toBe(false);
    });
  });
});
