<script setup lang="ts">
/**
 * 服务管理：开关、重启、状态
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

const { t } = useI18n();
const store = useSettingsStore();
const { services } = storeToRefs(store);
const loading = ref(false);

const CORE_SERVICES = ['ssh', 'docker'];

onMounted(async () => {
  loading.value = true;
  try {
    await store.fetchServices();
  } finally {
    loading.value = false;
  }
});

async function toggle(name: string, enabled: boolean): Promise<void> {
  if (!enabled && CORE_SERVICES.includes(name)) {
    try {
      await ElMessageBox.confirm(
        t('settings.services.stopConfirm', { name }),
        t('settings.services.warning'),
        { type: 'warning', confirmButtonText: t('settings.services.confirmStop'), cancelButtonText: t('common.cancel') },
      );
    } catch { return; }
  }
  try {
    await store.toggleService(name, enabled);
    ElMessage.success(t('settings.services.toggled', { name, state: enabled ? t('settings.services.stateEnabled') : t('settings.services.stateStopped') }));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function restart(name: string): Promise<void> {
  try {
    await store.restartService(name);
    ElMessage.success(t('settings.services.restarted', { name }));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">{{ t('settings.services.title') }}</div>
    <el-table :data="services" v-loading="loading" stripe size="small">
      <el-table-column prop="displayName" :label="t('settings.services.colService')" min-width="140" />
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <span :class="row.running ? 'dot dot--green' : 'dot dot--gray'" />
          {{ row.running ? t('common.running') : t('common.stopped') }}
        </template>
      </el-table-column>
      <el-table-column :label="t('settings.services.colAutostart')" width="100">
        <template #default="{ row }">
          <el-switch
            :model-value="row.enabled"
            size="small"
            @change="(v: boolean) => toggle(row.name, v)"
          />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.ops')" width="120">
        <template #default="{ row }">
          <el-button
            v-if="row.running"
            size="small"
            text
            @click="restart(row.name)"
          >{{ t('common.restart') }}</el-button>
          <el-button
            v-else
            size="small"
            text
            type="primary"
            @click="toggle(row.name, true)"
          >{{ t('common.start') }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      :title="t('settings.services.coreServiceTip')"
      style="margin-top: 12px"
    />
  </div>
</template>

<style scoped>
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.dot--green { background: var(--nx-green); }
.dot--gray { background: var(--nx-text-faint); }
</style>
