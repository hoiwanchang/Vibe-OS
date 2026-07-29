<script setup lang="ts">
/**
 * 任务栏通知铃铛（P2）
 * - 铃铛图标 + 未读数红色角标
 * - 点击展开 el-popover 通知面板：
 *     · 顶部：全部已读 / 设置（齿轮）
 *     · 列表：severity 色条（info=蓝/warning=黄/critical=红）+ 标题 + 时间
 *     · 底部：加载更多
 * - 设置 popover：webhook URL / 最低告警级别
 */
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Bell, Check, Setting } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { useNotificationStore } from '@/stores/notification';
import type { NotificationItem } from '@/api/types';
import { formatTime } from '@/utils/format';

const notification = useNotificationStore();
const { t } = useI18n();

/** 面板开关 */
const panelVisible = ref(false);
/** 设置面板开关 */
const settingsVisible = ref(false);

/** 设置表单（编辑 webhook 通道） */
const webhookUrl = ref('');
const minSeverity = ref<'info' | 'warning' | 'critical'>('info');

/** 未读数 */
const unread = computed(() => notification.unreadCount);

/** 是否还有更多（分页） */
const hasMore = computed(() => notification.notifications.length < notification.total);

/** severity 色条 class */
function severityClass(sev: NotificationItem['severity']): string {
  return `nb-item__bar--${sev}`;
}

/** severity 文本 */
function severityText(sev: NotificationItem['severity']): string {
  return t('desktop.notifications.severity.' + sev);
}

/** category 文本 */
function categoryText(cat: NotificationItem['category']): string {
  return t('desktop.notifications.category.' + cat);
}

/** 打开面板并加载第一页 */
async function onPanelShow(): Promise<void> {
  await notification.fetchNotifications(20, 0);
}

/** 加载更多 */
async function loadMore(): Promise<void> {
  await notification.fetchNotifications(20, notification.notifications.length);
}

/** 点击单条 → 标记已读 */
async function onItemClick(item: NotificationItem): Promise<void> {
  if (!item.read) await notification.markRead(item.id);
}

/** 全部已读 */
async function markAll(): Promise<void> {
  await notification.markAllRead();
  ElMessage.success(t('desktop.notifications.markedAllRead'));
}

/** 打开设置（从 store 填充表单） */
async function openSettings(): Promise<void> {
  await notification.fetchSettings();
  const webhook = notification.settings?.channels.find((c) => c.type === 'webhook');
  webhookUrl.value = webhook?.url ?? '';
  minSeverity.value = webhook?.minSeverity ?? 'info';
  settingsVisible.value = true;
}

/** 保存设置 */
async function saveSettings(): Promise<void> {
  const channels = [...(notification.settings?.channels ?? [])];
  const idx = channels.findIndex((c) => c.type === 'webhook');
  const webhook = {
    type: 'webhook' as const,
    enabled: webhookUrl.value.trim().length > 0,
    url: webhookUrl.value.trim() || undefined,
    minSeverity: minSeverity.value,
  };
  if (idx >= 0) channels[idx] = webhook;
  else channels.push(webhook);

  const ok = await notification.updateSettings({ channels });
  if (ok) {
    ElMessage.success(t('desktop.notifications.settingsSaved'));
    settingsVisible.value = false;
  } else {
    ElMessage.error(notification.lastError ?? t('desktop.notifications.saveFailed'));
  }
}
</script>

<template>
  <div class="nb-root">
    <el-popover
      v-model:visible="panelVisible"
      placement="top-end"
      :width="340"
      trigger="click"
      popper-class="nb-popover"
      @show="onPanelShow"
    >
      <template #reference>
        <button class="nb-bell" :class="{ 'nb-bell--active': panelVisible }" :title="t('desktop.notifications.center')">
          <el-icon :size="16"><Bell /></el-icon>
          <span v-if="unread > 0" class="nb-badge">{{ unread > 99 ? '99+' : unread }}</span>
        </button>
      </template>

      <div class="nb-panel">
        <!-- 面板头 -->
        <div class="nb-panel__head">
          <span class="nb-panel__title">{{ t('desktop.notifications.center') }}</span>
          <div class="nb-panel__actions">
            <el-button size="small" text :icon="Check" @click="markAll">{{ t('desktop.notifications.markAllRead') }}</el-button>
            <el-button size="small" text :icon="Setting" @click="openSettings" />
          </div>
        </div>

        <!-- 通知列表 -->
        <div v-loading="notification.loading" class="nb-list">
          <div v-if="notification.notifications.length === 0 && !notification.loading" class="nb-empty">
            {{ t('desktop.notifications.empty') }}
          </div>
          <div
            v-for="item in notification.notifications"
            :key="item.id"
            class="nb-item"
            :class="{ 'nb-item--unread': !item.read }"
            @click="onItemClick(item)"
          >
            <span class="nb-item__bar" :class="severityClass(item.severity)" />
            <div class="nb-item__body">
              <div class="nb-item__head">
                <span class="nb-item__title">{{ item.title }}</span>
                <span class="nb-item__sev" :class="severityClass(item.severity)">
                  {{ severityText(item.severity) }}
                </span>
              </div>
              <div class="nb-item__detail">{{ item.detail }}</div>
              <div class="nb-item__meta nx-mono">
                {{ categoryText(item.category) }} · {{ item.source }} · {{ formatTime(item.createdAt) }}
              </div>
            </div>
          </div>
        </div>

        <!-- 加载更多 -->
        <div v-if="hasMore" class="nb-panel__footer">
          <el-button size="small" text :loading="notification.loading" @click="loadMore">
            {{ t('desktop.notifications.loadMore', { count: notification.total - notification.notifications.length }) }}
          </el-button>
        </div>
      </div>
    </el-popover>

    <!-- 设置面板 -->
    <el-drawer v-model="settingsVisible" :title="t('desktop.notifications.settings')" size="380px" append-to-body>
      <el-form label-position="top">
        <el-form-item :label="t('desktop.notifications.webhookUrl')">
          <el-input
            v-model="webhookUrl"
            placeholder="https://example.com/hook"
            class="nx-mono"
            clearable
          />
        </el-form-item>
        <el-form-item :label="t('desktop.notifications.minLevel')">
          <el-select v-model="minSeverity" style="width: 100%">
            <el-option :label="t('desktop.notifications.levelInfo')" value="info" />
            <el-option :label="t('desktop.notifications.levelWarning')" value="warning" />
            <el-option :label="t('desktop.notifications.levelCritical')" value="critical" />
          </el-select>
        </el-form-item>
        <el-button type="primary" @click="saveSettings">{{ t('common.save') }}</el-button>
      </el-form>
    </el-drawer>
  </div>
</template>

<style scoped>
.nb-root {
  display: inline-flex;
}

.nb-bell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--nx-text-faint);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.nb-bell:hover {
  color: var(--nx-text);
  background: var(--nx-bg-sunken);
}

.nb-bell--active {
  color: var(--nx-amber);
}

.nb-badge {
  position: absolute;
  top: 2px;
  right: 1px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--el-color-danger);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  font-family: var(--nx-font-mono);
  border-radius: 8px;
  line-height: 1;
}

.nb-panel {
  display: flex;
  flex-direction: column;
}

.nb-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--nx-border-faint);
  margin-bottom: 8px;
}

.nb-panel__title {
  font-family: var(--nx-font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--nx-amber);
}

.nb-panel__actions {
  display: flex;
  align-items: center;
}

.nb-list {
  max-height: 340px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nb-empty {
  color: var(--nx-text-faint);
  font-size: 12px;
  text-align: center;
  padding: 28px 0;
}

.nb-item {
  display: flex;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--nx-border-faint);
  background: var(--nx-bg-sunken);
  cursor: pointer;
  transition: border-color 0.15s;
}

.nb-item:hover {
  border-color: var(--nx-border-strong);
}

.nb-item--unread {
  border-left-width: 1px;
  background: var(--nx-surface);
}

.nb-item__bar {
  flex-shrink: 0;
  width: 3px;
  align-self: stretch;
}

.nb-item__bar--info {
  background: var(--el-color-info);
}

.nb-item__bar--warning {
  background: var(--el-color-warning);
}

.nb-item__bar--critical {
  background: var(--el-color-danger);
}

.nb-item__body {
  flex: 1;
  min-width: 0;
}

.nb-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 3px;
}

.nb-item__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--nx-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nb-item__sev {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 1px 5px;
}

.nb-item__sev--info {
  color: var(--el-color-info);
  border: 1px solid var(--el-color-info);
}

.nb-item__sev--warning {
  color: var(--el-color-warning);
  border: 1px solid var(--el-color-warning);
}

.nb-item__sev--critical {
  color: var(--el-color-danger);
  border: 1px solid var(--el-color-danger);
}

.nb-item__detail {
  font-size: 11px;
  color: var(--nx-text-faint);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.nb-item__meta {
  font-size: 9px;
  color: var(--nx-text-faint);
  opacity: 0.7;
  margin-top: 4px;
}

.nb-panel__footer {
  text-align: center;
  padding-top: 8px;
  border-top: 1px solid var(--nx-border-faint);
  margin-top: 8px;
}
</style>
