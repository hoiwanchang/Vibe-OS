/**
 * oauth-clients 模块 — 业务逻辑层
 */
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { AppError } from '../../common/app-error.js';
import * as dao from '../oidc/oidc.dao.js';
import type { OAuthClient } from '../oidc/oidc.types.js';
import type {
  ClientResponse,
  CreateClientRequest,
  CreateClientResponse,
  ResetSecretResponse,
  UpdateClientRequest,
} from './oauth-clients.types.js';

const BCRYPT_COST = 12;
const DEFAULT_SCOPES = ['openid', 'profile', 'email'];
const DEFAULT_GRANT_TYPES: OAuthClient['grantTypes'] = ['authorization_code', 'refresh_token'];

/** 转换为响应格式（去除 secretHash） */
function toResponse(client: OAuthClient): ClientResponse {
  return {
    id: client.id,
    name: client.name,
    redirectUris: client.redirectUris,
    postLogoutRedirectUris: client.postLogoutRedirectUris,
    scopes: client.scopes,
    grantTypes: client.grantTypes,
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
    logoUrl: client.logoUrl,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    enabled: client.enabled,
  };
}

/** 列出所有客户端 */
export async function listClients(): Promise<ClientResponse[]> {
  const clients = await dao.loadClients();
  return clients.map(toResponse);
}

/** 获取客户端详情 */
export async function getClient(id: string): Promise<ClientResponse> {
  const client = await dao.findClient(id);
  if (!client) throw AppError.notFound(`客户端 [${id}]`);
  return toResponse(client);
}

/** 注册新客户端 */
export async function createClient(req: CreateClientRequest): Promise<CreateClientResponse> {
  if (!req.name?.trim()) throw AppError.badRequest('INVALID_NAME', '客户端名称不能为空');
  if (!req.redirectUris?.length) throw AppError.badRequest('INVALID_REDIRECT', '至少需要一个 redirect_uri');

  const clientId = nanoid(21);
  const clientSecret = nanoid(42);
  const secretHash = await bcrypt.hash(clientSecret, BCRYPT_COST);
  const now = new Date().toISOString();

  const client: OAuthClient = {
    id: clientId,
    secretHash,
    name: req.name.trim(),
    redirectUris: req.redirectUris,
    postLogoutRedirectUris: req.postLogoutRedirectUris ?? [],
    scopes: req.scopes ?? DEFAULT_SCOPES,
    grantTypes: req.grantTypes ?? DEFAULT_GRANT_TYPES,
    tokenEndpointAuthMethod: req.tokenEndpointAuthMethod ?? 'client_secret_basic',
    logoUrl: req.logoUrl,
    createdAt: now,
    updatedAt: now,
    enabled: true,
  };

  const clients = await dao.loadClients();
  clients.push(client);
  await dao.saveClients(clients);

  return { ...toResponse(client), secret: clientSecret };
}

/** 更新客户端 */
export async function updateClient(id: string, req: UpdateClientRequest): Promise<ClientResponse> {
  const clients = await dao.loadClients();
  const idx = clients.findIndex((c) => c.id === id);
  if (idx === -1) throw AppError.notFound(`客户端 [${id}]`);

  const client = clients[idx]!;
  if (req.name !== undefined) client.name = req.name.trim();
  if (req.redirectUris !== undefined) client.redirectUris = req.redirectUris;
  if (req.postLogoutRedirectUris !== undefined) client.postLogoutRedirectUris = req.postLogoutRedirectUris;
  if (req.scopes !== undefined) client.scopes = req.scopes;
  if (req.grantTypes !== undefined) client.grantTypes = req.grantTypes;
  if (req.tokenEndpointAuthMethod !== undefined) client.tokenEndpointAuthMethod = req.tokenEndpointAuthMethod;
  if (req.logoUrl !== undefined) client.logoUrl = req.logoUrl;
  if (req.enabled !== undefined) client.enabled = req.enabled;
  client.updatedAt = new Date().toISOString();

  clients[idx] = client;
  await dao.saveClients(clients);
  return toResponse(client);
}

/** 删除客户端 */
export async function deleteClient(id: string): Promise<void> {
  const clients = await dao.loadClients();
  const filtered = clients.filter((c) => c.id !== id);
  if (filtered.length === clients.length) throw AppError.notFound(`客户端 [${id}]`);
  await dao.saveClients(filtered);
}

/** 重置 secret */
export async function resetSecret(id: string): Promise<ResetSecretResponse> {
  const clients = await dao.loadClients();
  const idx = clients.findIndex((c) => c.id === id);
  if (idx === -1) throw AppError.notFound(`客户端 [${id}]`);

  const newSecret = nanoid(42);
  const secretHash = await bcrypt.hash(newSecret, BCRYPT_COST);
  const client = clients[idx]!;
  client.secretHash = secretHash;
  client.updatedAt = new Date().toISOString();
  await dao.saveClients(clients);

  return { id, secret: newSecret };
}

/** 初始化预置客户端（Vibe OS Web UI） */
export async function initPresetClients(): Promise<void> {
  const clients = await dao.loadClients();
  const hasPreset = clients.some((c) => c.name === 'Vibe OS Web UI');
  if (hasPreset) return;

  const clientId = nanoid(21);
  const clientSecret = nanoid(42);
  const secretHash = await bcrypt.hash(clientSecret, BCRYPT_COST);
  const now = new Date().toISOString();

  clients.push({
    id: clientId,
    secretHash,
    name: 'Vibe OS Web UI',
    redirectUris: ['http://127.0.0.1:5173/oauth/callback', 'http://localhost:5173/oauth/callback'],
    postLogoutRedirectUris: ['http://127.0.0.1:5173/', 'http://localhost:5173/'],
    scopes: ['openid', 'profile', 'email', 'groups'],
    grantTypes: ['authorization_code', 'refresh_token'],
    tokenEndpointAuthMethod: 'none',
    createdAt: now,
    updatedAt: now,
    enabled: true,
  });
  await dao.saveClients(clients);
}
