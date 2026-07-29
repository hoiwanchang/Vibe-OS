<script setup lang="ts">
/**
 * 存储策略：硬盘休眠、SMART、回收站、写缓存
 */
import { onMounted, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

const { t } = useI18n();
const store = useSettingsStore();
const { settings, saving } = storeToRefs(store);

const form = reactive({
  diskSpindownMinutes: 30,
  hddStandbyEnabled: true,
  smartCheckInterval: 24,
  smartEmailAlert: true,
  trashRetentionDays: 30,
  autoDefrag: false,
  writeCache: 'enabled' as 'enabled' | 'disabled',
});

onMounted(async () => {
  if (!settings.value) await store.fetchSettings();
  const s = settings.value?.storage;
  if (s) Object.assign(form, s);
});

async function save(): Promise<void> {
  try {
    await store.saveSection('storage', { ...form });
    ElMessage.success(t('settings.storage.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">{{ t('settings.storage.hddSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.storage.hddSleep')">
        <el-input-number v-model="form.diskSpindownMinutes" :min="0" :max="600" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.storage.hddStandby')">
        <el-switch v-model="form.hddStandbyEnabled" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.storage.smartSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.storage.smartInterval')">
        <el-input-number v-model="form.smartCheckInterval" :min="1" :max="168" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.storage.smartNotify')">
        <el-switch v-model="form.smartEmailAlert" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.storage.trashSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.storage.trashAutoClean')">
        <el-input-number v-model="form.trashRetentionDays" :min="0" :max="365" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.storage.cacheSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item>
        <el-radio-group v-model="form.writeCache" @change="store.markDirty()">
          <el-radio value="enabled">{{ t('common.enabled') }}</el-radio>
          <el-radio value="disabled">{{ t('common.disabled') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-alert type="warning" :closable="false" show-icon
        :title="t('settings.storage.cacheTip')" />
      <el-form-item style="margin-top: 16px">
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.saveChanges') }}</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
