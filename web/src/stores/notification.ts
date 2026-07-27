/**
 * 通知中心状态仓库
 * 任务栏铃铛 + 未读角标 + 通知面板（历史持久化）
 * fetchUnreadCount 集成到 system.fetchAll() 的 5s 轮询
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { notificationApi } from '@/api';
import type { NotificationItem, NotificationSettings } from '@/api/types';

export const useNotificationStore = defineStore('notification', () => {
  /** 通知列表 */
  const notifications = ref<NotificationItem[]>([]);
  /** 总数（用于分页判断） */
  const total = ref(0);
  /** 未读计数（任务栏角标） */
  const unreadCount = ref(0);
  /** 通知设置 */
  const settings = ref<NotificationSettings | null>(null);
  /** 加载中 */
  const loading = ref(false);
  /** 最近一次错误 */
  const lastError = ref<string | null>(null);

  /** 拉取未读计数（轻量，供 5s 轮询调用） */
  async function fetchUnreadCount(): Promise<void> {
    try {
      const res = await notificationApi.unreadCount();
      unreadCount.value = res.unread;
    } catch {
      /* 轮询失败静默忽略 */
    }
  }

  /** 拉取通知列表（分页 + 可选严重级别过滤） */
  async function fetchNotifications(limit = 20, offset = 0, severity?: string): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const res = await notificationApi.list(limit, offset, severity);
      if (offset === 0) {
        notifications.value = res.notifications;
      } else {
        notifications.value = [...notifications.value, ...res.notifications];
      }
      total.value = res.total;
      unreadCount.value = res.unread;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 标记单条已读 */
  async function markRead(id: string): Promise<void> {
    try {
      await notificationApi.markRead(id);
      const item = notifications.value.find((n) => n.id === id);
      if (item && !item.read) {
        item.read = true;
        unreadCount.value = Math.max(0, unreadCount.value - 1);
      }
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** 全部标记已读 */
  async function markAllRead(): Promise<void> {
    try {
      await notificationApi.markAllRead();
      for (const n of notifications.value) n.read = true;
      unreadCount.value = 0;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** 删除通知 */
  async function remove(id: string): Promise<void> {
    try {
      await notificationApi.remove(id);
      const idx = notifications.value.findIndex((n) => n.id === id);
      if (idx >= 0) {
        const item = notifications.value[idx];
        if (item && !item.read) unreadCount.value = Math.max(0, unreadCount.value - 1);
        notifications.value.splice(idx, 1);
        total.value = Math.max(0, total.value - 1);
      }
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** 拉取通知设置 */
  async function fetchSettings(): Promise<void> {
    try {
      settings.value = await notificationApi.settings();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** 更新通知设置 */
  async function updateSettings(payload: NotificationSettings): Promise<boolean> {
    try {
      settings.value = await notificationApi.updateSettings(payload);
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  return {
    notifications,
    total,
    unreadCount,
    settings,
    loading,
    lastError,
    fetchUnreadCount,
    fetchNotifications,
    markRead,
    markAllRead,
    remove,
    fetchSettings,
    updateSettings,
  };
});
