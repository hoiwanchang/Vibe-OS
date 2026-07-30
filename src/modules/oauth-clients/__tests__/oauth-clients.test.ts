/**
 * oauth-clients 模块单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('bcrypt', () => ({
  default: { hash: vi.fn().mockResolvedValue('$2b$12$hashed') },
}));
vi.mock('nanoid', () => ({
  nanoid: vi.fn((len?: number) => 'x'.repeat(len ?? 21)),
}));

const mockLoadClients = vi.fn().mockResolvedValue([]);
const mockSaveClients = vi.fn().mockResolvedValue(undefined);
const mockFindClient = vi.fn().mockResolvedValue(null);
vi.mock('../../oidc/oidc.dao.js', () => ({
  loadClients: (...a: unknown[]) => mockLoadClients(...a),
  saveClients: (...a: unknown[]) => mockSaveClients(...a),
  findClient: (...a: unknown[]) => mockFindClient(...a),
}));

vi.mock('../../../config.js', () => ({
  VIBEOS_APP_DIR: '/tmp/vibeos-data/vibeos',
}));

import * as service from '../oauth-clients.service.js';

const existingClient = {
  id: 'c1', secretHash: '$2b$12$h', name: 'Existing',
  redirectUris: ['http://localhost/cb'], postLogoutRedirectUris: [],
  scopes: ['openid'], grantTypes: ['authorization_code'] as const,
  tokenEndpointAuthMethod: 'client_secret_basic' as const,
  createdAt: '2025-01-01', updatedAt: '2025-01-01', enabled: true,
};

describe('oauth-clients.service', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('listClients', () => {
    it('应返回所有客户端（不含 secretHash）', async () => {
      mockLoadClients.mockResolvedValue([existingClient]);
      const list = await service.listClients();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('c1');
      expect(list[0]).not.toHaveProperty('secretHash');
    });

    it('空列表应返回空数组', async () => {
      mockLoadClients.mockResolvedValue([]);
      expect(await service.listClients()).toEqual([]);
    });
  });

  describe('getClient', () => {
    it('存在应返回', async () => {
      mockFindClient.mockResolvedValue(existingClient);
      const c = await service.getClient('c1');
      expect(c.name).toBe('Existing');
    });

    it('不存在应 404', async () => {
      mockFindClient.mockResolvedValue(null);
      await expect(service.getClient('bad')).rejects.toThrow();
    });
  });

  describe('createClient', () => {
    it('应创建并返回明文 secret', async () => {
      mockLoadClients.mockResolvedValue([]);
      const result = await service.createClient({
        name: 'My App', redirectUris: ['http://localhost/cb'],
      });
      expect(result.id).toBeDefined();
      expect(result.secret).toBeDefined();
      expect(result.name).toBe('My App');
      expect(mockSaveClients).toHaveBeenCalled();
    });

    it('空名称应 400', async () => {
      await expect(service.createClient({ name: '', redirectUris: ['x'] })).rejects.toThrow('名称不能为空');
    });

    it('无 redirect_uri 应 400', async () => {
      await expect(service.createClient({ name: 'App', redirectUris: [] })).rejects.toThrow('至少需要一个 redirect_uri');
    });
  });

  describe('updateClient', () => {
    it('应更新字段', async () => {
      mockLoadClients.mockResolvedValue([{ ...existingClient }]);
      const result = await service.updateClient('c1', { name: 'Updated', enabled: false });
      expect(result.name).toBe('Updated');
      expect(result.enabled).toBe(false);
    });

    it('不存在应 404', async () => {
      mockLoadClients.mockResolvedValue([]);
      await expect(service.updateClient('bad', { name: 'x' })).rejects.toThrow();
    });
  });

  describe('deleteClient', () => {
    it('应删除', async () => {
      mockLoadClients.mockResolvedValue([{ ...existingClient }]);
      await service.deleteClient('c1');
      expect(mockSaveClients).toHaveBeenCalledWith([]);
    });

    it('不存在应 404', async () => {
      mockLoadClients.mockResolvedValue([]);
      await expect(service.deleteClient('bad')).rejects.toThrow();
    });
  });

  describe('resetSecret', () => {
    it('应返回新 secret', async () => {
      mockLoadClients.mockResolvedValue([{ ...existingClient }]);
      const result = await service.resetSecret('c1');
      expect(result.secret).toBeDefined();
      expect(result.id).toBe('c1');
    });

    it('不存在应 404', async () => {
      mockLoadClients.mockResolvedValue([]);
      await expect(service.resetSecret('bad')).rejects.toThrow();
    });
  });

  describe('initPresetClients', () => {
    it('无预置时应创建 Vibe OS Web UI', async () => {
      mockLoadClients.mockResolvedValue([]);
      await service.initPresetClients();
      expect(mockSaveClients).toHaveBeenCalled();
      const saved = mockSaveClients.mock.calls[0][0];
      expect(saved[0].name).toBe('Vibe OS Web UI');
    });

    it('已有预置时不应重复创建', async () => {
      mockLoadClients.mockResolvedValue([{ ...existingClient, name: 'Vibe OS Web UI' }]);
      await service.initPresetClients();
      expect(mockSaveClients).not.toHaveBeenCalled();
    });
  });
});
