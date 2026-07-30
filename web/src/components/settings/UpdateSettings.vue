<script setup lang="ts">
/**
 * 系统更新：版本信息、通道、检查更新
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { settingsApi } from '@/api';

const { t, locale } = useI18n();
const store = useSettingsStore();
const { settings, saving } = storeToRefs(store);

const checking = ref(false);
const updateResult = ref<{ updateAvailable: boolean; latestVersion?: string; changelog?: string } | null>(null);

onMounted(async () => {
  if (!settings.value) await store.fetchSettings();
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
</style>
