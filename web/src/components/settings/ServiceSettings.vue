<script setup lang="ts">
/**
 * 服务管理：开关、重启、状态
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

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
        `停止 ${name} 可能导致管理中断，确定继续？`,
        '警告',
        { type: 'warning', confirmButtonText: '确定停止', cancelButtonText: '取消' },
      );
    } catch { return; }
  }
  try {
    await store.toggleService(name, enabled);
    ElMessage.success(`${name} 已${enabled ? '启用' : '停止'}`);
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function restart(name: string): Promise<void> {
  try {
    await store.restartService(name);
    ElMessage.success(`${name} 已重启`);
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">系统服务</div>
    <el-table :data="services" v-loading="loading" stripe size="small">
      <el-table-column prop="displayName" label="服务" min-width="140" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <span :class="row.running ? 'dot dot--green' : 'dot dot--gray'" />
          {{ row.running ? '运行中' : '已停止' }}
        </template>
      </el-table-column>
      <el-table-column label="开机启动" width="100">
        <template #default="{ row }">
          <el-switch
            :model-value="row.enabled"
            size="small"
            @change="(v: boolean) => toggle(row.name, v)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button
            v-if="row.running"
            size="small"
            text
            @click="restart(row.name)"
          >重启</el-button>
          <el-button
            v-else
            size="small"
            text
            type="primary"
            @click="toggle(row.name, true)"
          >启动</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="停止核心服务（SSH / Docker）可能导致管理中断"
      style="margin-top: 12px"
    />
  </div>
</template>

<style scoped>
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.dot--green { background: var(--nx-green); }
.dot--gray { background: var(--nx-text-faint); }
</style>
