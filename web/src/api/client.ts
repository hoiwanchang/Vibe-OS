/**
 * 统一 HTTP 客户端
 * - 解包后端 { success, data, error } 响应格式
 * - 统一异常处理：业务错误抛出 ApiError（含状态码与错误码）
 * - 演示降级：后端网络不可达且开启演示模式时，返回内置模拟数据
 */
import axios, { type AxiosRequestConfig } from 'axios';
import { demoActive } from './state';
import { t } from '@/i18n';
import type { ApiEnvelope } from './types';

/** 业务 API 错误（含 HTTP 状态码与机器可读错误码） */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 演示模式开关（构建时注入，默认开启） */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false';

const instance = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

/** 请求拦截器：附加 Bearer Token（如已配置） */
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('vibeos.token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * 将未知错误规范化为 ApiError
 */
function toApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as
      | { error?: { code?: string; message?: string } }
      | undefined;
    return new ApiError(
      err.response?.status ?? 0,
      body?.error?.code ?? (err.response ? 'HTTP_ERROR' : 'NETWORK_ERROR'),
      body?.error?.message ??
        (err.response
          ? t('api.requestFailed', { status: err.response.status })
          : t('api.cannotConnect')),
    );
  }
  return new ApiError(
    0,
    'UNKNOWN',
    err instanceof Error ? err.message : String(err),
  );
}

/**
 * 统一请求入口
 * @param config - axios 请求配置
 * @param demoFallback - 演示数据工厂（后端不可达时降级返回）
 * @returns 解包后的业务数据
 * @throws ApiError 业务错误或网络错误（未开启演示降级时）
 */
export async function request<T>(
  config: AxiosRequestConfig,
  demoFallback?: () => T,
): Promise<T> {
  try {
    const res = await instance.request<ApiEnvelope<T>>(config);
    demoActive.value = false;
    if (res.data && typeof res.data === 'object' && 'data' in res.data) {
      return res.data.data;
    }
    return res.data as unknown as T;
  } catch (err) {
    // 网络层错误（无 response）且演示模式开启 → 降级为模拟数据
    if (axios.isAxiosError(err) && !err.response && DEMO_MODE && demoFallback) {
      demoActive.value = true;
      return demoFallback();
    }
    throw toApiError(err);
  }
}
