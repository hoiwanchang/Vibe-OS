<script setup lang="ts">
/**
 * 安全设置：HTTPS、SSH、登录保护、IP 黑白名单、防火墙
 */
import { onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

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
    ElMessage.success('安全设置已保存');
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">HTTPS / SSL</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="启用 HTTPS">
        <el-switch v-model="form.httpsEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item v-if="form.httpsEnabled" label="HTTPS 端口">
        <el-input-number v-model="form.httpsPort" :min="1" :max="65535" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">SSH 安全</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="启用 SSH">
        <el-switch v-model="form.sshEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item v-if="form.sshEnabled" label="SSH 端口">
        <el-input-number v-model="form.sshPort" :min="1" :max="65535" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item label="允许密码登录（推荐仅密钥）">
        <el-switch v-model="form.sshPasswordAuth" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">登录保护</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="最大尝试次数">
        <el-input-number v-model="form.maxLoginAttempts" :min="1" :max="20" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item label="锁定时间（分钟）">
        <el-input-number v-model="form.lockoutMinutes" :min="1" :max="1440" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">IP 访问控制</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="黑名单（每行一个 IP 或 CIDR）">
        <el-input v-model="form.ipBlacklist" type="textarea" :rows="3" @input="store.markDirty()" />
      </el-form-item>
      <el-form-item label="白名单（留空 = 不限制）">
        <el-input v-model="form.ipWhitelist" type="textarea" :rows="3" @input="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">防火墙</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="启用防火墙">
        <el-switch v-model="form.firewallEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item label="自动安全更新">
        <el-switch v-model="form.autoSecurityUpdates" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存修改</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
