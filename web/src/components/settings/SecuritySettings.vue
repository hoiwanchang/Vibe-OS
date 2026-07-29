<script setup lang="ts">
/**
 * 安全设置：HTTPS、SSH、登录保护、IP 黑白名单、防火墙
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
  httpsEnabled: false,
  httpsPort: 443,
  sshEnabled: true,
  sshPort: 22,
  sshPasswordAuth: false,
  maxLoginAttempts: 5,
  lockoutMinutes: 30,
  ipBlacklist: '',
  ipWhitelist: '',
  firewallEnabled: true,
  autoSecurityUpdates: true,
});

onMounted(async () => {
  if (!settings.value) await store.fetchSettings();
  const s = settings.value?.security;
  if (s) {
    form.httpsEnabled = s.httpsEnabled;
    form.httpsPort = s.httpsPort;
    form.sshEnabled = s.sshEnabled;
    form.sshPort = s.sshPort;
    form.sshPasswordAuth = s.sshPasswordAuth;
    form.maxLoginAttempts = s.maxLoginAttempts;
    form.lockoutMinutes = s.lockoutMinutes;
    form.ipBlacklist = s.ipBlacklist.join('\n');
    form.ipWhitelist = s.ipWhitelist.join('\n');
    form.firewallEnabled = s.firewallEnabled;
    form.autoSecurityUpdates = s.autoSecurityUpdates;
  }
});

async function save(): Promise<void> {
  try {
    await store.saveSection('security', {
      ...form,
      ipBlacklist: form.ipBlacklist.split('\n').map(s => s.trim()).filter(Boolean),
      ipWhitelist: form.ipWhitelist.split('\n').map(s => s.trim()).filter(Boolean),
    });
    ElMessage.success(t('settings.security.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">HTTPS / SSL</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.security.enableHttps')">
        <el-switch v-model="form.httpsEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item v-if="form.httpsEnabled" :label="t('settings.security.httpsPort')">
        <el-input-number v-model="form.httpsPort" :min="1" :max="65535" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.security.sshSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.security.enableSsh')">
        <el-switch v-model="form.sshEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item v-if="form.sshEnabled" :label="t('settings.security.sshPort')">
        <el-input-number v-model="form.sshPort" :min="1" :max="65535" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.security.allowPassword')">
        <el-switch v-model="form.sshPasswordAuth" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.security.loginSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.security.maxAttempts')">
        <el-input-number v-model="form.maxLoginAttempts" :min="1" :max="20" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.security.lockoutMinutes')">
        <el-input-number v-model="form.lockoutMinutes" :min="1" :max="1440" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.security.ipSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.security.blacklist')">
        <el-input v-model="form.ipBlacklist" type="textarea" :rows="3" @input="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.security.whitelist')">
        <el-input v-model="form.ipWhitelist" type="textarea" :rows="3" @input="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.security.firewallSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.security.enableFirewall')">
        <el-switch v-model="form.firewallEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.security.autoUpdate')">
        <el-switch v-model="form.autoSecurityUpdates" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.saveChanges') }}</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
