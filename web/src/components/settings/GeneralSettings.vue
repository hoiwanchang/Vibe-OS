<script setup lang="ts">
/**
 * 常规设置：主机名、描述、时区、语言、NTP
 */
import { onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

const store = useSettingsStore();
const { settings, saving } = storeToRefs(store);

const form = reactive({
  hostname: '',
  description: '',
  timezone: 'Asia/Shanghai',
  locale: 'zh-CN',
  ntpEnabled: true,
  ntpServer: 'ntp.aliyun.com',
});

const timezones = [
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Hong_Kong',
  'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London',
  'Europe/Berlin', 'Europe/Moscow', 'Australia/Sydney',
];

const locales = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'ja-JP', label: '日本語' },
];

onMounted(async () => {
  if (!settings.value) await store.fetchSettings();
  const g = settings.value?.general;
  if (g) {
    form.hostname = g.hostname;
    form.description = g.description;
    form.timezone = g.timezone;
    form.locale = g.locale;
    form.ntpEnabled = g.ntpEnabled;
    form.ntpServer = g.ntpServer;
  }
});

async function save(): Promise<void> {
  try {
    await store.saveSection('general', { ...form });
    ElMessage.success('常规设置已保存');
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">常规设置</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="设备名称">
        <el-input v-model="form.hostname" maxlength="64" @input="store.markDirty()" />
      </el-form-item>
      <el-form-item label="设备描述">
        <el-input v-model="form.description" maxlength="256" @input="store.markDirty()" />
      </el-form-item>
      <el-form-item label="时区">
        <el-select v-model="form.timezone" style="width: 100%" @change="store.markDirty()">
          <el-option v-for="tz in timezones" :key="tz" :label="tz" :value="tz" />
        </el-select>
      </el-form-item>
      <el-form-item label="语言">
        <el-select v-model="form.locale" style="width: 100%" @change="store.markDirty()">
          <el-option v-for="l in locales" :key="l.value" :label="l.label" :value="l.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="NTP 时间同步">
        <el-switch v-model="form.ntpEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item v-if="form.ntpEnabled" label="NTP 服务器">
        <el-input v-model="form.ntpServer" @input="store.markDirty()" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存修改</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
