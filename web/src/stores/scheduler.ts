/**
 * 计划任务状态仓库
 * Cron 任务可视化管理 / 执行历史
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { schedulerApi } from '@/api';
import type { CreateScheduledJobRequest, JobExecution, ScheduledJob } from '@/api/types';

export const useSchedulerStore = defineStore('scheduler', () => {
  /** 计划任务列表 */
  const jobs = ref<ScheduledJob[]>([]);
  /** 各任务执行历史（按任务 id 索引） */
  const executions = ref<Record<string, JobExecution[]>>({});
  /** 加载中 */
  const loading = ref(false);
  /** 最近一次错误 */
  const lastError = ref<string | null>(null);

  /** 拉取计划任务列表 */
  async function fetchJobs(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      jobs.value = await schedulerApi.jobs();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 创建计划任务 */
  async function createJob(payload: CreateScheduledJobRequest): Promise<boolean> {
    try {
      await schedulerApi.createJob(payload);
      await fetchJobs();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 更新计划任务 */
  async function updateJob(id: string, payload: Partial<CreateScheduledJobRequest>): Promise<boolean> {
    try {
      await schedulerApi.updateJob(id, payload);
      await fetchJobs();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 删除计划任务 */
  async function deleteJob(id: string): Promise<boolean> {
    try {
      await schedulerApi.deleteJob(id);
      await fetchJobs();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 立即执行计划任务 */
  async function runJob(id: string): Promise<boolean> {
    try {
      await schedulerApi.runJob(id);
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
      executions.value[jobId] = await schedulerApi.history(jobId);
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    jobs,
    executions,
    loading,
    lastError,
    fetchJobs,
    createJob,
    updateJob,
    deleteJob,
    runJob,
    fetchHistory,
  };
});
