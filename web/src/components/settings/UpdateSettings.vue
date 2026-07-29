<script setup lang="ts">
/**
 * 系统更新：版本信息、通道、检查更新
 */
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { settingsApi } from '@/api';

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
      ElMessage.success('当前已是最新版本');
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
    ElMessage.success('更新设置已保存');
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">当前版本</div>
    <div class="version-card">
      <div class="version-name">NAISys v{{ settings?.update.currentVersion ?? '—' }}</div>
      <div class="version-meta nx-mono">
        上次检查：{{ settings?.update.lastCheck ? new Date(settings.update.lastCheck).toLocaleString('zh-CN') : '从未' }}
      </div>
    </div>

    <el-form label-position="top" class="settings-form" style="margin-top: 16px">
      <el-form-item label="更新通道">
        <el-select v-model="settings!.update.channel" style="width: 160px" @change="store.markDirty()">
          <el-option label="稳定版" value="stable" />
          <el-option label="测试版" value="beta" />
        </el-select>
      </el-form-item>
      <el-form-item label="自动检查更新">
        <el-switch v-model="settings!.update.autoCheck" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item label="自动安装更新（不推荐）">
        <el-switch v-model="settings!.update.autoInstall" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div v-if="updateResult" class="update-result">
      <el-alert
        v-if="updateResult.updateAvailable"
        type="success"
        :closable="false"
        show-icon
        :title="`发现新版本 ${updateResult.latestVersion}`"
        :description="updateResult.changelog"
      />
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        title="当前已是最新版本"
      />
    </div>

    <div style="display: flex; gap: 12px; margin-top: 16px">
      <el-button :loading="checking" @click="checkUpdate">检查更新</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存修改</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-top: 16px"
      title="离线环境：将升级包放入 /data/naisys/update/ 目录后点击「检查更新」即可识别"
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
