/**
 * 共享文件夹状态仓库
 * SMB/NFS/WebDAV 共享的创建、编辑、状态监控
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { sharingApi } from '@/api';
import type { CreateShareRequest, ShareInfo, ShareStatusResponse } from '@/api/types';

export const useSharingStore = defineStore('sharing', () => {
  /** 共享列表 */
  const shares = ref<ShareInfo[]>([]);
  /** 各共享连接详情（按名称索引） */
  const status = ref<Record<string, ShareStatusResponse>>({});
  /** 加载中 */
  const loading = ref(false);
  /** 最近一次错误 */
  const lastError = ref<string | null>(null);

  /** 拉取共享列表 */
  async function fetchShares(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      shares.value = await sharingApi.list();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 拉取单个共享状态（运行状态 + 连接详情） */
  async function fetchStatus(name: string): Promise<void> {
    try {
      status.value[name] = await sharingApi.status(name);
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** 创建共享 */
  async function createShare(payload: CreateShareRequest): Promise<boolean> {
    try {
      await sharingApi.create(payload);
      await fetchShares();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 更新共享 */
  async function updateShare(name: string, payload: Partial<CreateShareRequest>): Promise<boolean> {
    try {
      await sharingApi.update(name, payload);
      await fetchShares();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 删除共享 */
  async function removeShare(name: string): Promise<boolean> {
    try {
      await sharingApi.remove(name);
      await fetchShares();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 重启共享服务 */
  async function restartService(name: string): Promise<boolean> {
    try {
      await sharingApi.restart(name);
      await fetchStatus(name);
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  return {
    shares,
    status,
    loading,
    lastError,
    fetchShares,
    fetchStatus,
    createShare,
    updateShare,
    removeShare,
    restartService,
  };
});
