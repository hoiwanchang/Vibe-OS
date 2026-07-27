/**
 * 下载中心状态仓库
 * 下载任务管理（HTTP/BT/磁力）/ 实时进度 / 全局限速
 * 有活动任务时 2s 轮询刷新进度
 */
import { computed, onUnmounted, ref } from 'vue';
import { defineStore } from 'pinia';
import { downloadApi } from '@/api';
import type { AddDownloadRequest, DownloadTask } from '@/api/types';

/** 活动任务轮询间隔（毫秒） */
const POLL_MS = 2000;

export const useDownloadStore = defineStore('download', () => {
  /** 下载任务列表 */
  const tasks = ref<DownloadTask[]>([]);
  /** 全局设置 */
  const settings = ref<Record<string, string>>({});
  /** 加载中 */
  const loading = ref(false);
  /** 最近一次错误 */
  const lastError = ref<string | null>(null);
  /** 轮询定时器 */
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  /** 是否存在活动任务（决定是否轮询） */
  const hasActive = computed(() =>
    tasks.value.some((t) => t.status === 'active'),
  );

  /** 统计摘要 */
  const summary = computed(() => {
    const active = tasks.value.filter((t) => t.status === 'active').length;
    const waiting = tasks.value.filter((t) => t.status === 'waiting' || t.status === 'paused').length;
    const complete = tasks.value.filter((t) => t.status === 'complete').length;
    const totalSpeed = tasks.value.reduce((s, t) => s + (t.status === 'active' ? t.downloadSpeed : 0), 0);
    return { active, waiting, complete, totalSpeed };
  });

  /** 拉取任务列表 */
  async function fetchTasks(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      tasks.value = await downloadApi.tasks();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 新建下载任务（支持批量 URL） */
  async function addTask(urls: string[], targetDir?: string): Promise<boolean> {
    try {
      const payload: AddDownloadRequest = { urls };
      if (targetDir) payload.targetDir = targetDir;
      await downloadApi.addTask(payload);
      await fetchTasks();
      startPolling();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 删除下载任务 */
  async function removeTask(gid: string): Promise<boolean> {
    try {
      await downloadApi.removeTask(gid);
      await fetchTasks();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 暂停下载任务 */
  async function pauseTask(gid: string): Promise<boolean> {
    try {
      await downloadApi.pauseTask(gid);
      await fetchTasks();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 恢复下载任务 */
  async function resumeTask(gid: string): Promise<boolean> {
    try {
      await downloadApi.resumeTask(gid);
      await fetchTasks();
      startPolling();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 暂停全部活动任务 */
  async function pauseAll(): Promise<void> {
    const active = tasks.value.filter((t) => t.status === 'active' || t.status === 'waiting');
    await Promise.allSettled(active.map((t) => downloadApi.pauseTask(t.gid)));
    await fetchTasks();
  }

  /** 恢复全部暂停任务 */
  async function resumeAll(): Promise<void> {
    const paused = tasks.value.filter((t) => t.status === 'paused');
    await Promise.allSettled(paused.map((t) => downloadApi.resumeTask(t.gid)));
    await fetchTasks();
    startPolling();
  }

  /** 拉取全局设置 */
  async function fetchSettings(): Promise<void> {
    try {
      settings.value = await downloadApi.settings();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** 更新全局设置 */
  async function updateSettings(payload: Record<string, string>): Promise<boolean> {
    try {
      settings.value = await downloadApi.updateSettings(payload);
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 启动轮询（仅在有活动任务时生效，2s 间隔） */
  function startPolling(): void {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (!hasActive.value) {
        stopPolling();
        return;
      }
      void downloadApi.tasks().then((list) => {
        tasks.value = list;
      }).catch(() => {
        /* 轮询失败静默忽略，下次重试 */
      });
    }, POLL_MS);
  }

  /** 停止轮询 */
  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  onUnmounted(() => {
    stopPolling();
  });

  return {
    tasks,
    settings,
    loading,
    lastError,
    hasActive,
    summary,
    fetchTasks,
    addTask,
    removeTask,
    pauseTask,
    resumeTask,
    pauseAll,
    resumeAll,
    fetchSettings,
    updateSettings,
    startPolling,
    stopPolling,
  };
});
