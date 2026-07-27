/**
 * 存储池状态仓库
 * 物理磁盘总览 / RAID 阵列创建管理 / 池状态监控 / Scrub
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { storageApi } from '@/api';
import type {
  CreatePoolRequest,
  DiskSmartDetail,
  PhysicalDisk,
  ScrubStatus,
  StoragePoolInfo,
} from '@/api/types';

export const useStorageStore = defineStore('storage', () => {
  /** 物理磁盘列表 */
  const disks = ref<PhysicalDisk[]>([]);
  /** 存储池列表 */
  const pools = ref<StoragePoolInfo[]>([]);
  /** 各池 Scrub 状态（按池名索引） */
  const scrubStatus = ref<Record<string, ScrubStatus>>({});
  /** 加载中 */
  const loading = ref(false);
  /** 最近一次错误 */
  const lastError = ref<string | null>(null);

  /** 未加入任何池的磁盘（可用于创建/扩容） */
  function freeDisks(): PhysicalDisk[] {
    return disks.value.filter((d) => !d.inPool && d.device !== '/dev/nvme0n1');
  }

  /** 拉取磁盘列表 */
  async function fetchDisks(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      disks.value = await storageApi.disks();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 拉取存储池列表 */
  async function fetchPools(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      pools.value = await storageApi.pools();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 拉取全部（磁盘 + 池） */
  async function fetchAll(): Promise<void> {
    await Promise.allSettled([fetchDisks(), fetchPools()]);
  }

  /** 创建存储池 */
  async function createPool(payload: CreatePoolRequest): Promise<boolean> {
    try {
      await storageApi.createPool(payload);
      await fetchAll();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 销毁存储池 */
  async function destroyPool(name: string): Promise<boolean> {
    try {
      await storageApi.destroyPool(name);
      await fetchAll();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 扩容存储池 */
  async function expandPool(name: string, diskDevices: string[]): Promise<boolean> {
    try {
      await storageApi.expandPool(name, diskDevices);
      await fetchAll();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 获取池内磁盘 SMART 详情 */
  async function poolSmart(name: string): Promise<DiskSmartDetail[]> {
    try {
      return await storageApi.poolSmart(name);
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return [];
    }
  }

  /** 启动 Scrub */
  async function startScrub(name: string): Promise<boolean> {
    try {
      await storageApi.startScrub(name);
      await pollScrubStatus(name);
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 轮询 Scrub 状态 */
  async function pollScrubStatus(name: string): Promise<void> {
    try {
      scrubStatus.value[name] = await storageApi.scrubStatus(name);
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    disks,
    pools,
    scrubStatus,
    loading,
    lastError,
    freeDisks,
    fetchDisks,
    fetchPools,
    fetchAll,
    createPool,
    destroyPool,
    expandPool,
    poolSmart,
    startScrub,
    pollScrubStatus,
  };
});
