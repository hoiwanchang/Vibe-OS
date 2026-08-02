/**
 * oidc 模块单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock keys module
const mockGetSigningKey = vi.fn();
const mockGetAllPublicKeys = vi.fn().mockResolvedValue([]);
const mockGetJwks = vi.fn().mockReturnValue({ keys: [{ kid: 'test-kid', kty: 'RSA' }] });
vi.mock('../oidc.keys.js', () => ({
  getSigningKey: () => mockGetSigningKey(),
  getAllPublicKeys: () => mockGetAllPublicKeys(),
  getJwks: () => mockGetJwks(),
}));

// Mock dao
const mockFindClient = vi.fn().mockResolvedValue(null);
const mockSaveAuthCode = vi.fn().mockResolvedValue(undefined);
const mockLoadAuthCode = vi.fn().mockResolvedValue(null);
const mockMarkCodeUsed = vi.fn().mockResolvedValue(undefined);
const mockDeleteAuthCode = vi.fn().mockResolvedValue(undefined);
const mockFindRefreshToken = vi.fn().mockResolvedValue(null);
const mockSaveRefreshToken = vi.fn().mockResolvedValue(undefined);
const mockRevokeRefreshToken = vi.fn().mockResolvedValue(undefined);
vi.mock('../oidc.dao.js', () => ({
  findClient: (...a: unknown[]) => mockFindClient(...a),
  saveAuthCode: (...a: unknown[]) => mockSaveAuthCode(...a),
  loadAuthCode: (...a: unknown[]) => mockLoadAuthCode(...a),
  markCodeUsed: (...a: unknown[]) => mockMarkCodeUsed(...a),
  deleteAuthCode: (...a: unknown[]) => mockDeleteAuthCode(...a),
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

// Use real jose for token signing/verification
import * as service from '../oidc.service.js';

const testClient = {
  id: 'client-1', secretHash: '$2b$12$hash', name: 'Test App',
  redirectUris: ['http://localhost:3000/callback'],
  postLogoutRedirectUris: [], scopes: ['openid', 'profile', 'email'],
  grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'] as const,
  tokenEndpointAuthMethod: 'client_secret_basic' as const,
  createdAt: '2025-01-01', updatedAt: '2025-01-01', enabled: true,
};

describe('oidc.service', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('getDiscovery', () => {
    it('应返回标准发现文档', () => {
      const doc = service.getDiscovery();
      expect(doc.issuer).toBe('http://127.0.0.1:3000');
      expect(doc.authorization_endpoint).toContain('/oidc/authorize');
      expect(doc.token_endpoint).toContain('/oidc/token');
      expect(doc.jwks_uri).toContain('/oidc/jwks.json');
      expect(doc.scopes_supported).toContain('openid');
      expect(doc.code_challenge_methods_supported).toEqual(['S256']);
    });
  });

  describe('validateAuthorizeRequest', () => {
    it('合法请求应返回客户端', async () => {
      mockFindClient.mockResolvedValue(testClient);
      const client = await service.validateAuthorizeRequest({
        client_id: 'client-1', redirect_uri: 'http://localhost:3000/callback',
        scope: 'openid profile', response_type: 'code',
        code_challenge: 'abc', code_challenge_method: 'S256',
      });
      expect(client.id).toBe('client-1');
    });

    it('response_type 非 code 应拒绝', async () => {
      await expect(service.validateAuthorizeRequest({
        client_id: 'c', redirect_uri: 'r', scope: 'openid',
        response_type: 'token', code_challenge: 'x', code_challenge_method: 'S256',
      })).rejects.toThrow('仅支持 response_type=code');
    });

    it('PKCE method 非 S256 应拒绝', async () => {
      await expect(service.validateAuthorizeRequest({
        client_id: 'c', redirect_uri: 'r', scope: 'openid',
        response_type: 'code', code_challenge: 'x', code_challenge_method: 'plain',
      })).rejects.toThrow('仅支持 code_challenge_method=S256');
    });

    it('缺少 code_challenge 应拒绝', async () => {
      await expect(service.validateAuthorizeRequest({
        client_id: 'c', redirect_uri: 'r', scope: 'openid',
        response_type: 'code', code_challenge: '', code_challenge_method: 'S256',
      })).rejects.toThrow('缺少 code_challenge');
    });

    it('scope 无 openid 应拒绝', async () => {
      await expect(service.validateAuthorizeRequest({
        client_id: 'c', redirect_uri: 'r', scope: 'profile',
        response_type: 'code', code_challenge: 'x', code_challenge_method: 'S256',
      })).rejects.toThrow('scope 必须包含 openid');
    });

    it('未知 client_id 应拒绝', async () => {
      mockFindClient.mockResolvedValue(null);
      await expect(service.validateAuthorizeRequest({
        client_id: 'bad', redirect_uri: 'r', scope: 'openid',
        response_type: 'code', code_challenge: 'x', code_challenge_method: 'S256',
      })).rejects.toThrow('未知的 client_id');
    });

    it('禁用的客户端应拒绝', async () => {
      mockFindClient.mockResolvedValue({ ...testClient, enabled: false });
      await expect(service.validateAuthorizeRequest({
        client_id: 'client-1', redirect_uri: 'http://localhost:3000/callback',
        scope: 'openid', response_type: 'code', code_challenge: 'x', code_challenge_method: 'S256',
      })).rejects.toThrow('客户端已禁用');
    });

    it('redirect_uri 不匹配应拒绝', async () => {
      mockFindClient.mockResolvedValue(testClient);
      await expect(service.validateAuthorizeRequest({
        client_id: 'client-1', redirect_uri: 'http://evil.com/callback',
        scope: 'openid', response_type: 'code', code_challenge: 'x', code_challenge_method: 'S256',
      })).rejects.toThrow('redirect_uri 不在白名单中');
    });
  });

  describe('issueAuthCode', () => {
    it('应生成并保存授权码', async () => {
      const code = await service.issueAuthCode({
        clientId: 'client-1', uid: 1000, username: 'admin',
        scope: 'openid', redirectUri: 'http://localhost:3000/callback',
        codeChallenge: 'challenge123',
      });
      expect(code).toHaveLength(32);
      expect(mockSaveAuthCode).toHaveBeenCalled();
      const saved = mockSaveAuthCode.mock.calls[0][0];
      expect(saved.uid).toBe(1000);
      expect(saved.used).toBe(false);
    });
  });
});
