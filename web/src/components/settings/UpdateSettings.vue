<script setup lang="ts">
/**
 * 系统更新：版本信息、通道、检查更新
 * + 应用更新（Phase 7）：容器应用检查/应用/历史
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { settingsApi, appUpdateApi } from '@/api';
import type { AppUpdateStatus, AppUpdateAvailable, AppUpdateHistoryEntry } from '@/api/types';

const { t, locale } = useI18n();
const store = useSettingsStore();
const { settings, saving } = storeToRefs(store);

const checking = ref(false);
const updateResult = ref<{ updateAvailable: boolean; latestVersion?: string; changelog?: string } | null>(null);

/* ---------- 应用更新（Phase 7） ---------- */
const appStatus = ref<AppUpdateStatus | null>(null);
const appUpdates = ref<AppUpdateAvailable[]>([]);
const appHistory = ref<AppUpdateHistoryEntry[]>([]);
const appChecking = ref(false);
const appApplying = ref<string | null>(null);

onMounted(async () => {
  if (!settings.value) await store.fetchSettings();
  // 加载应用更新状态
  try {
    const [status, available, history] = await Promise.all([
      appUpdateApi.status(),
      appUpdateApi.available(),
      appUpdateApi.history(),
    ]);
    appStatus.value = status;
    appUpdates.value = available;
    appHistory.value = history;
  } catch { /* 服务不可用 */ }
});

async function checkUpdate(): Promise<void> {
  checking.value = true;
  updateResult.value = null;
  try {
    updateResult.value = await settingsApi.checkUpdate();
    if (!updateResult.value.updateAvailable) {
      ElMessage.success(t('common.upToDate'));
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    checking.value = false;
  }
}

async function save(): Promise<void> {
  if (!settings.value) return;
  try {
    await store.saveSection('update', {
      autoCheck: settings.value.update.autoCheck,
      autoInstall: settings.value.update.autoInstall,
      channel: settings.value.update.channel,
    });
    ElMessage.success(t('settings.update.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function checkAppUpdates(): Promise<void> {
  appChecking.value = true;
  try {
    await appUpdateApi.check();
    const available = await appUpdateApi.available();
    appUpdates.value = available;
    if (available.length === 0) {
      ElMessage.success(t('settings.update.appsUpToDate'));
    } else {
      ElMessage.info(t('settings.update.appsFound', { count: available.length }));
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    appChecking.value = false;
  }
}

async function applyUpdate(appId: string): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('settings.update.applyConfirm', { app: appId }),
      t('settings.update.confirmTitle'),
      { type: 'warning' },
    );
  } catch { return; }
  appApplying.value = appId;
  try {
    await appUpdateApi.apply(appId);
    ElMessage.success(t('settings.update.applySuccess', { app: appId }));
    // 刷新列表
    const [available, history] = await Promise.all([appUpdateApi.available(), appUpdateApi.history()]);
    appUpdates.value = available;
    appHistory.value = history;
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    appApplying.value = null;
  }
}

async function saveAppMode(mode: 'manual' | 'auto'): Promise<void> {
  try {
    appStatus.value = await appUpdateApi.updateConfig({ mode });
    ElMessage.success(t('settings.update.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">{{ t('settings.update.currentVersion') }}</div>
    <div class="version-card">
      <div class="version-name">Vibe OS v{{ settings?.update.currentVersion ?? '—' }}</div>
      <div class="version-meta nx-mono">
        {{ settings?.update.lastCheck ? t('settings.update.lastCheck', { time: new Date(settings.update.lastCheck).toLocaleString(locale) }) : t('settings.update.lastCheckNever') }}
      </div>
    </div>

    <el-form label-position="top" class="settings-form" style="margin-top: 16px">
      <el-form-item :label="t('settings.update.channel')">
        <el-select v-model="settings!.update.channel" style="width: 160px" @change="store.markDirty()">
          <el-option :label="t('settings.update.channelStable')" value="stable" />
          <el-option :label="t('settings.update.channelBeta')" value="beta" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('settings.update.autoCheck')">
        <el-switch v-model="settings!.update.autoCheck" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.update.autoInstall')">
        <el-switch v-model="settings!.update.autoInstall" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div v-if="updateResult" class="update-result">
      <el-alert
        v-if="updateResult.updateAvailable"
        type="success"
        :closable="false"
        show-icon
        :title="t('settings.update.newVersion', { version: updateResult.latestVersion })"
        :description="updateResult.changelog"
      />
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        :title="t('common.upToDate')"
      />
    </div>

    <div style="display: flex; gap: 12px; margin-top: 16px">
      <el-button :loading="checking" @click="checkUpdate">{{ t('common.checkUpdate') }}</el-button>
      <el-button type="primary" :loading="saving" @click="save">{{ t('common.saveChanges') }}</el-button>
    </div>

    <!-- 应用更新（Phase 7） -->
    <div class="nx-panel-title" style="margin-top: 24px">{{ t('settings.update.appSection') }}</div>

    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.update.appMode')">
        <el-radio-group :model-value="appStatus?.mode ?? 'manual'" @change="(v: string | number | boolean) => saveAppMode(v as 'manual' | 'auto')">
          <el-radio value="manual">{{ t('settings.update.modeManual') }}</el-radio>
          <el-radio value="auto">{{ t('settings.update.modeAuto') }}</el-radio>
        </el-radio-group>
      </el-form-item>
    </el-form>

    <div style="display: flex; gap: 12px; margin-bottom: 16px">
      <el-button :loading="appChecking" @click="checkAppUpdates">{{ t('settings.update.checkApps') }}</el-button>
    </div>

    <!-- 可用更新列表 -->
    <div v-if="appUpdates.length > 0" class="app-update-list">
      <div v-for="u in appUpdates" :key="u.appId" class="app-update-item">
        <div class="app-update-info">
          <span class="app-update-name">{{ u.appName }}</span>
          <span class="nx-mono app-update-ver">{{ u.currentVersion }} → {{ u.latestVersion }}</span>
        </div>
        <el-button size="small" type="primary" :loading="appApplying === u.appId" @click="applyUpdate(u.appId)">
          {{ t('settings.update.apply') }}
        </el-button>
      </div>
    </div>
    <el-alert v-else type="info" :closable="false" show-icon :title="t('settings.update.appsUpToDate')" style="margin-bottom: 16px" />

    <!-- 更新历史 -->
    <div v-if="appHistory.length > 0">
      <div class="nx-panel-title" style="margin-top: 16px; font-size: 13px">{{ t('settings.update.history') }}</div>
      <div class="app-history-list">
        <div v-for="(h, i) in appHistory" :key="i" class="app-history-item">
          <el-tag :type="h.success ? 'success' : 'danger'" size="small" style="flex-shrink: 0">
            {{ h.success ? t('common.success') : t('common.failed') }}
          </el-tag>
          <span>{{ h.appName }}</span>
          <span class="nx-mono" style="color: var(--nx-text-dim)">{{ h.fromVersion }} → {{ h.toVersion }}</span>
          <span class="nx-mono" style="margin-left: auto; color: var(--nx-text-dim); font-size: 11px">
            {{ new Date(h.updatedAt).toLocaleString(locale) }}
          </span>
        </div>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-top: 16px"
      :title="t('settings.update.offlineTip')"
    />
  </div>
</template>

<style scoped>
.version-card {
  padding: 16px;
  border: 1px solid var(--nx-border-faint);
}
.version-name {
  font-family: var(--nx-font-display);
  font-size: 18px;
  font-weight: 600;
}
.version-meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--nx-text-dim);
}
.update-result { margin-top: 16px; }
.app-update-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
.app-update-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--nx-border-faint);
}
.app-update-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.app-update-name { font-weight: 600; }
.app-update-ver { font-size: 12px; color: var(--nx-text-dim); }
.app-history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.app-history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--nx-border-faint);
  font-size: 13px;
}
</style>
