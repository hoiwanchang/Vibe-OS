<script setup lang="ts">
/**
 * 电源管理：UPS、定时开关机、空闲关机、WoL
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
  upsEnabled: false,
  upsDevice: '/dev/usb/hiddev0',
  upsShutdownThreshold: 15,
  scheduledPowerOn: { enabled: false, time: '07:00' },
  scheduledShutdown: { enabled: false, time: '23:00' },
  idleShutdown: { enabled: false, minutes: 120 },
  wakeOnLan: true,
});

onMounted(async () => {
  if (!settings.value) await store.fetchSettings();
  const p = settings.value?.power;
  if (p) {
    form.upsEnabled = p.upsEnabled;
    form.upsDevice = p.upsDevice;
    form.upsShutdownThreshold = p.upsShutdownThreshold;
    form.scheduledPowerOn = { ...p.scheduledPowerOn };
    form.scheduledShutdown = { ...p.scheduledShutdown };
    form.idleShutdown = { ...p.idleShutdown };
    form.wakeOnLan = p.wakeOnLan;
  }
});

async function save(): Promise<void> {
  try {
    await store.saveSection('power', { ...form });
    ElMessage.success(t('settings.power.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">{{ t('settings.power.upsSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.power.upsConnected')">
        <el-switch v-model="form.upsEnabled" @change="store.markDirty()" />
      </el-form-item>
      <template v-if="form.upsEnabled">
        <el-form-item :label="t('settings.power.upsDevice')">
          <el-input v-model="form.upsDevice" @input="store.markDirty()" />
        </el-form-item>
        <el-form-item :label="t('settings.power.upsShutdownLevel')">
          <el-input-number v-model="form.upsShutdownThreshold" :min="5" :max="50" @change="store.markDirty()" />
        </el-form-item>
      </template>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.power.scheduleSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.power.wakeOnSchedule')">
        <div style="display: flex; align-items: center; gap: 12px">
          <el-switch v-model="form.scheduledPowerOn.enabled" @change="store.markDirty()" />
          <el-time-picker
            v-if="form.scheduledPowerOn.enabled"
            v-model="form.scheduledPowerOn.time"
            format="HH:mm"
            value-format="HH:mm"
            style="width: 120px"
            @change="store.markDirty()"
          />
        </div>
      </el-form-item>
      <el-form-item :label="t('settings.power.shutdownOnSchedule')">
        <div style="display: flex; align-items: center; gap: 12px">
          <el-switch v-model="form.scheduledShutdown.enabled" @change="store.markDirty()" />
          <el-time-picker
            v-if="form.scheduledShutdown.enabled"
            v-model="form.scheduledShutdown.time"
            format="HH:mm"
            value-format="HH:mm"
            style="width: 120px"
            @change="store.markDirty()"
          />
        </div>
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.power.idleSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.power.idleMinutes')">
        <div style="display: flex; align-items: center; gap: 12px">
          <el-switch v-model="form.idleShutdown.enabled" @change="store.markDirty()" />
          <el-input-number
            v-if="form.idleShutdown.enabled"
            v-model="form.idleShutdown.minutes"
            :min="10" :max="1440"
            @change="store.markDirty()"
          />
        </div>
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">Wake-on-LAN</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.power.wolSection')">
        <el-switch v-model="form.wakeOnLan" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.saveChanges') }}</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
