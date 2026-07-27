/**
 * API 端点集合 — 按后端模块分组
 * 所有函数统一走 request()，网络不可达时降级为演示数据
 */
import { request } from './client';
import * as demo from './demo-data';
import type {
  AppDirsInitResponse,
  ContainerDeployRequest,
  ContainerDeployResponse,
  ContainerInfo,
  ContainerLogResult,
  CreateUserRequest,
  CreateUserResponse,
  DiskHealthResponse,
  HealthInfo,
  NetworkDriversResponse,
  SystemOverview,
  TailscaleStatusResponse,
  UserListResponse,
  UserQuotaInfo,
} from './types';

/* ---------- 系统 / 指标 ---------- */

export const systemApi = {
  /** 健康检查 */
  health: () => request<HealthInfo>({ url: '/health' }, demo.demoHealth),

  /** 系统概览（CPU/内存/存储池聚合） */
  overview: () =>
    request<SystemOverview>({ url: '/metrics/overview' }, demo.demoOverview),

  /** 磁盘 SMART 健康 */
  diskHealth: () =>
    request<DiskHealthResponse>(
      { url: '/hardware/disk-health' },
      demo.demoDiskHealth,
    ),

  /** 网卡驱动与链路状态 */
  networkDrivers: () =>
    request<NetworkDriversResponse>(
      { url: '/hardware/network-drivers' },
      demo.demoNetworkDrivers,
    ),
};

/* ---------- 容器 / AI 应用 ---------- */

export const containerApi = {
  /** 容器列表 */
  list: () =>
    request<ContainerInfo[]>(
      { url: '/container/list' },
      demo.demoContainers,
    ),

  /** 部署容器 */
  deploy: (payload: ContainerDeployRequest) =>
    request<ContainerDeployResponse>({
      url: '/container/deploy',
      method: 'post',
      data: payload,
    }),

  /** 初始化应用数据目录 /data/naisys/{appname}/ */
  initDirs: (appname: string) =>
    request<AppDirsInitResponse>({
      url: '/container/init-dirs',
      method: 'post',
      data: { appname },
    }),

  /** 重启容器 */
  restart: (name: string) =>
    request<{ name: string; status: string }>({
      url: `/container/${encodeURIComponent(name)}/restart`,
      method: 'post',
    }),

  /** 停止容器 */
  stop: (name: string) =>
    request<{ name: string; status: string }>({
      url: `/container/${encodeURIComponent(name)}/stop`,
      method: 'post',
    }),

  /** 删除容器 */
  remove: (name: string, force = false) =>
    request<{ name: string; status: string }>({
      url: `/container/${encodeURIComponent(name)}`,
      method: 'delete',
      params: force ? { force: 'true' } : undefined,
    }),

  /** 容器日志 */
  logs: (name: string, tail = 200) =>
    request<ContainerLogResult>(
      {
        url: `/container/${encodeURIComponent(name)}/logs`,
        params: { tail },
      },
      () => demo.demoLogs(name),
    ),
};

/* ---------- Tailscale ---------- */

export const tailscaleApi = {
  /** 节点状态 */
  status: () =>
    request<TailscaleStatusResponse>(
      { url: '/tailscale/status' },
      demo.demoTailscale,
    ),

  /** 下发 ACL 策略 */
  pushAcl: (policy: Record<string, unknown>) =>
    request<{ status: string }>({
      url: '/tailscale/acl',
      method: 'post',
      data: policy,
    }),

  /** 配置 Subnet Router */
  subnetRouter: (subnets: string[]) =>
    request<{ subnets: string[]; status: string }>({
      url: '/tailscale/subnet-router',
      method: 'post',
      data: { subnets },
    }),
};

/* ---------- 用户 ---------- */

export const userApi = {
  /** 受管用户列表 */
  list: () => request<UserListResponse>({ url: '/users' }, demo.demoUsers),

  /** 创建用户数据空间 */
  create: (payload: CreateUserRequest) =>
    request<CreateUserResponse>({
      url: '/users',
      method: 'post',
      data: payload,
    }),

  /** 查询用户配额 */
  quota: (uid: number) =>
    request<UserQuotaInfo>({ url: `/user/${uid}/quota` }),

  /** 初始化用户空间 */
  initSpace: (uid: number, quotaBytes?: string) =>
    request<UserQuotaInfo>({
      url: `/user/${uid}/init`,
      method: 'post',
      data: quotaBytes ? { quotaBytes } : {},
    }),
};
