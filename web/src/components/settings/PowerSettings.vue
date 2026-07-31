<script setup lang="ts">
/**
 * 电源管理：UPS（NUT 实时状态）、定时开关机、空闲关机、WoL
 */
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { upsApi } from '@/api';
import type { UpsStatus } from '@/api/types';

const { t } = useI18n();
const store = useSettingsStore();
const { settings, saving } = storeToRefs(store);

const upsStatus = ref<UpsStatus | null>(null);

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
  // 获取 UPS 实时状态
  try {
    upsStatus.value = await upsApi.status();
  } catch { /* NUT 未安装或 UPS 未连接 */ }
});

async function save(): Promise<void> {
  try {
    await store.saveSection('power', { ...form });
    // 同步关机阈值到 UPS 模块
    if (form.upsEnabled) {
      try {
        await upsApi.updateConfig({ shutdownThreshold: form.upsShutdownThreshold, notifyEmail: null });
      } catch { /* 非关键 */ }
    }
    ElMessage.success(t('settings.power.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">{{ t('settings.power.upsSection') }}</div>

    <!-- UPS 实时状态卡片 -->
    <div v-if="upsStatus" class="ups-status-card">
      <div class="ups-status-row">
        <span class="ups-label">{{ t('settings.power.upsOnline') }}</span>
        <el-tag :type="upsStatus.online ? 'success' : 'danger'" size="small">
          {{ upsStatus.online ? t('common.online') : t('common.offline') }}
        </el-tag>
      </div>
      <div class="ups-status-row">
        <span class="ups-label">{{ t('settings.power.upsBattery') }}</span>
        <el-progress :percentage="upsStatus.batteryCharge" :stroke-width="14" :color="upsStatus.batteryCharge < 20 ? '#f56c6c' : '#67c23a'" style="flex: 1" />
      </div>
      <div class="ups-status-row">
        <span class="ups-label">{{ t('settings.power.upsLoad') }}</span>
        <span class="nx-mono">{{ upsStatus.load }}%</span>
      </div>
      <div class="ups-status-row">
        <span class="ups-label">{{ t('settings.power.upsVoltage') }}</span>
        <span class="nx-mono">{{ upsStatus.inputVoltage }}V</span>
      </div>
      <div class="ups-status-row">
        <span class="ups-label">{{ t('settings.power.upsRuntime') }}</span>
        <span class="nx-mono">{{ Math.floor(upsStatus.runtime / 60) }} min</span>
      </div>
      <div class="ups-status-row">
        <span class="ups-label">{{ t('settings.power.upsModel') }}</span>
        <span class="nx-mono">{{ upsStatus.modelName }}</span>
      </div>
    </div>
    <el-alert v-else type="info" :closable="false" show-icon :title="t('settings.power.upsNotDetected')" style="margin-bottom: 16px" />

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

<style scoped>
.ups-status-card {
  padding: 14px 16px;
  border: 1px solid var(--nx-border-faint);
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ups-status-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ups-label {
  width: 80px;
  font-size: 12px;
  color: var(--nx-text-dim);
  flex-shrink: 0;
}
</style>
