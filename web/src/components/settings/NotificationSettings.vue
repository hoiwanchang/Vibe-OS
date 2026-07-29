<script setup lang="ts">
/**
 * 通知设置：渠道管理、全局级别、免打扰、测试
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { settingsApi } from '@/api';
import type { SettingsNotificationChannel } from '@/api/types';

const { t } = useI18n();
const store = useSettingsStore();
const { settings, saving } = storeToRefs(store);

const channels = ref<SettingsNotificationChannel[]>([]);
const globalMinSeverity = ref<'info' | 'warning' | 'critical'>('info');
const quietStart = ref('22:00');
const quietEnd = ref('08:00');
const testing = ref(false);

onMounted(async () => {
  if (!settings.value) await store.fetchSettings();
  const n = settings.value?.notification;
  if (n) {
    channels.value = n.channels.map(c => ({ ...c }));
    globalMinSeverity.value = n.globalMinSeverity;
    quietStart.value = n.quietHoursStart;
    quietEnd.value = n.quietHoursEnd;
  }
});

function addChannel(): void {
  channels.value.push({
    id: `ch-${Date.now()}`,
    type: 'webhook',
    name: '',
    enabled: true,
    url: '',
    minSeverity: 'warning',
  });
  store.markDirty();
}

function removeChannel(id: string): void {
  channels.value = channels.value.filter(c => c.id !== id);
  store.markDirty();
}

async function testChannel(type: string): Promise<void> {
  testing.value = true;
  try {
    const res = await settingsApi.testNotification(type);
    if (res.sent) ElMessage.success(t('settings.notification.testSent'));
    else ElMessage.warning(res.error ?? t('settings.notification.sendFailed'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    testing.value = false;
  }
}

async function save(): Promise<void> {
  try {
    await store.saveSection('notification', {
      channels: channels.value,
      globalMinSeverity: globalMinSeverity.value,
      quietHoursStart: quietStart.value,
      quietHoursEnd: quietEnd.value,
    });
    ElMessage.success(t('settings.notification.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">{{ t('settings.notification.channels') }}</div>
    <div v-for="ch in channels" :key="ch.id" class="channel-card">
      <div class="channel-head">
        <el-switch v-model="ch.enabled" size="small" @change="store.markDirty()" />
        <el-input v-model="ch.name" :placeholder="t('settings.notification.channelName')" size="small" style="width: 140px" @input="store.markDirty()" />
        <el-select v-model="ch.type" size="small" style="width: 100px" @change="store.markDirty()">
          <el-option label="Webhook" value="webhook" />
          <el-option label="Email" value="email" />
        </el-select>
        <el-select v-model="ch.minSeverity" size="small" style="width: 100px" @change="store.markDirty()">
          <el-option label="Info" value="info" />
          <el-option label="Warning" value="warning" />
          <el-option label="Critical" value="critical" />
        </el-select>
        <el-button size="small" text :loading="testing" @click="testChannel(ch.type)">{{ t('common.test') }}</el-button>
        <el-button size="small" text type="danger" @click="removeChannel(ch.id)">{{ t('common.delete') }}</el-button>
      </div>
      <el-input
        v-if="ch.type === 'webhook'"
        v-model="ch.url"
        placeholder="Webhook URL"
        size="small"
        style="margin-top: 8px"
        @input="store.markDirty()"
      />
      <template v-else>
        <el-input v-model="ch.emailTo" :placeholder="t('settings.notification.recipientEmail')" size="small" style="margin-top: 8px" @input="store.markDirty()" />
        <div style="display: flex; gap: 8px; margin-top: 8px">
          <el-input v-model="ch.emailSmtpHost" :placeholder="t('settings.notification.smtpHost')" size="small" @input="store.markDirty()" />
          <el-input-number v-model="ch.emailSmtpPort" :min="1" :max="65535" size="small" style="width: 100px" @change="store.markDirty()" />
        </div>
      </template>
    </div>
    <el-button size="small" style="margin-top: 8px" @click="addChannel">{{ t('settings.notification.addChannel') }}</el-button>

    <div class="nx-panel-title" style="margin-top: 24px">{{ t('settings.notification.globalSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.notification.defaultLevel')">
        <el-select v-model="globalMinSeverity" style="width: 160px" @change="store.markDirty()">
          <el-option label="Info" value="info" />
          <el-option label="Warning" value="warning" />
          <el-option label="Critical" value="critical" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('settings.notification.dnd')">
        <div style="display: flex; align-items: center; gap: 8px">
          <el-time-picker v-model="quietStart" format="HH:mm" value-format="HH:mm" style="width: 120px" @change="store.markDirty()" />
          <span>{{ t('settings.notification.dndTo') }}</span>
          <el-time-picker v-model="quietEnd" format="HH:mm" value-format="HH:mm" style="width: 120px" @change="store.markDirty()" />
        </div>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.saveChanges') }}</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.channel-card {
  padding: 12px;
  border: 1px solid var(--nx-border-faint);
  margin-bottom: 8px;
}
.channel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
