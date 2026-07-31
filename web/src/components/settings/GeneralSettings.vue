<script setup lang="ts">
/**
 * 常规设置：主机名、描述、时区、语言、NTP
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { setLocale, type AppLocale } from '@/i18n';
import { getStoredTheme, setTheme, type ThemeMode } from '@/utils/theme';

const { t, locale } = useI18n();

const store = useSettingsStore();
const { settings, saving } = storeToRefs(store);

const themeMode = ref<ThemeMode>(getStoredTheme());

function onThemeChange(val: ThemeMode): void {
  themeMode.value = val;
  setTheme(val);
}

const form = reactive({
  hostname: '',
  description: '',
  timezone: 'Asia/Shanghai',
  locale: 'zh-CN' as AppLocale,
  ntpEnabled: true,
  ntpServer: 'ntp.aliyun.com',
});

const timezones = [
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Hong_Kong',
  'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London',
  'Europe/Berlin', 'Europe/Moscow', 'Australia/Sydney',
];

/** 界面语言选项：仅支持简体中文 / English（值须匹配 AppLocale） */
const locales = computed(() => [
  { value: 'zh-CN' as AppLocale, label: t('settings.general.localeZhCN') },
  { value: 'en' as AppLocale, label: t('settings.general.localeEnUS') },
]);

/** 切换界面语言：即时生效（更新 i18n + 持久化），并标记待保存以同步后端 */
function onLanguageChange(val: AppLocale): void {
  setLocale(val);
  store.markDirty();
}

onMounted(async () => {
  if (!settings.value) await store.fetchSettings();
  const g = settings.value?.general;
  if (g) {
    form.hostname = g.hostname;
    form.description = g.description;
    form.timezone = g.timezone;
    form.ntpEnabled = g.ntpEnabled;
    form.ntpServer = g.ntpServer;
  }
  // 语言以下拉反映当前生效的界面语言（localStorage/浏览器检测）为准
  form.locale = locale.value as AppLocale;
});

async function save(): Promise<void> {
  try {
    await store.saveSection('general', { ...form });
    ElMessage.success(t('settings.general.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">{{ t('settings.general.title') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.general.deviceName')">
        <el-input v-model="form.hostname" maxlength="64" @input="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.general.deviceDesc')">
        <el-input v-model="form.description" maxlength="256" @input="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.general.timezone')">
        <el-select v-model="form.timezone" style="width: 100%" @change="store.markDirty()">
          <el-option v-for="tz in timezones" :key="tz" :label="tz" :value="tz" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('settings.general.language')">
        <el-select v-model="form.locale" style="width: 100%" @change="onLanguageChange">
          <el-option v-for="l in locales" :key="l.value" :label="l.label" :value="l.value" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('settings.general.appearance')">
        <el-radio-group :model-value="themeMode" @change="(v: string | number | boolean) => onThemeChange(v as ThemeMode)">
          <el-radio value="dark">{{ t('settings.general.themeDark') }}</el-radio>
          <el-radio value="light">{{ t('settings.general.themeLight') }}</el-radio>
          <el-radio value="system">{{ t('settings.general.themeSystem') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('settings.general.ntp')">
        <el-switch v-model="form.ntpEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item v-if="form.ntpEnabled" :label="t('settings.general.ntpServer')">
        <el-input v-model="form.ntpServer" @input="store.markDirty()" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.saveChanges') }}</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
