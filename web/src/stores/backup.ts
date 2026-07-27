/**
 * 备份与快照状态仓库
 * 备份任务管理 / 手动定时执行 / 恢复 / 快照管理
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { backupApi } from '@/api';
import type {
  BackupExecution,
  BackupJob,
  CreateBackupJobRequest,
  SnapshotInfo,
} from '@/api/types';

export const useBackupStore = defineStore('backup', () => {
  /** 备份任务列表 */
  const jobs = ref<BackupJob[]>([]);
  /** 各任务执行历史（按任务 id 索引） */
  const executions = ref<Record<string, BackupExecution[]>>({});
  /** 快照列表 */
  const snapshots = ref<SnapshotInfo[]>([]);
  /** 加载中 */
  const loading = ref(false);
  /** 最近一次错误 */
  const lastError = ref<string | null>(null);

  /** 拉取备份任务列表 */
  async function fetchJobs(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      jobs.value = await backupApi.jobs();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 创建备份任务 */
  async function createJob(payload: CreateBackupJobRequest): Promise<boolean> {
    try {
      await backupApi.createJob(payload);
      await fetchJobs();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 立即执行备份任务 */
  async function runJob(id: string): Promise<boolean> {
    try {
      await backupApi.runJob(id);
      await fetchJobs();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 删除备份任务 */
  async function deleteJob(id: string): Promise<boolean> {
    try {
      await backupApi.deleteJob(id);
      await fetchJobs();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 拉取任务执行历史 */
  async function fetchHistory(jobId: string): Promise<void> {
    try {
      executions.value[jobId] = await backupApi.history(jobId);
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** 恢复备份 */
  async function restore(jobId: string, executionId: string, targetPath?: string): Promise<boolean> {
    try {
      await backupApi.restore(jobId, executionId, targetPath);
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 拉取快照列表 */
  async function fetchSnapshots(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      snapshots.value = await backupApi.snapshots();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 创建快照 */
  async function createSnapshot(pool: string, name: string): Promise<boolean> {
    try {
      await backupApi.createSnapshot(pool, name);
      await fetchSnapshots();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 删除快照 */
  async function deleteSnapshot(name: string): Promise<boolean> {
    try {
      await backupApi.deleteSnapshot(name);
      await fetchSnapshots();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  return {
    jobs,
    executions,
    snapshots,
    loading,
    lastError,
    fetchJobs,
    createJob,
    runJob,
    deleteJob,
    fetchHistory,
    restore,
    fetchSnapshots,
    createSnapshot,
    deleteSnapshot,
  };
});
