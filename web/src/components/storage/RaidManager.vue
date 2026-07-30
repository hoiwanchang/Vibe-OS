<script setup lang="ts">
/**
 * RAID 阵列管理（Phase 4）
 * 嵌入 StorageView
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { raidApi } from '@/api';
import type { RaidArray, RaidLevel } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const arrays = ref<RaidArray[]>([]);
const showCreateDialog = ref(false);
const createForm = ref({ name: '', level: 'raid1' as RaidLevel, devices: '' as string, spares: '' as string });

onMounted(async () => { await load(); });

async function load(): Promise<void> {
  loading.value = true;
  try { arrays.value = await raidApi.list(); }
  catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
}

async function createArray(): Promise<void> {
  const devices = createForm.value.devices.split(',').map(d => d.trim()).filter(Boolean);
  if (!createForm.value.name || devices.length < 2) {
    ElMessage.warning(t('storage.raid.invalidCreate'));
    return;
  }
  const spares = createForm.value.spares.split(',').map(d => d.trim()).filter(Boolean);
  try {
    await raidApi.create({ name: createForm.value.name, level: createForm.value.level, devices, spares: spares.length ? spares : undefined });
    ElMessage.success(t('storage.raid.created'));
    showCreateDialog.value = false;
    await load();
  } catch (err) { ElMessage.error(err instanceof Error ? err.message : String(err)); }
}

async function removeArray(arr: RaidArray): Promise<void> {
  try {
    await ElMessageBox.confirm(t('storage.raid.removeConfirm', { name: arr.name }), t('common.warning'), { type: 'warning' });
    await raidApi.remove(arr.name);
    ElMessage.success(t('storage.raid.removed'));
    await load();
  } catch { /* cancelled */ }
}

async function rebuild(arr: RaidArray): Promise<void> {
  try {
    await raidApi.rebuild(arr.name);
    ElMessage.success(t('storage.raid.rebuildStarted'));
    await load();
  } catch (err) { ElMessage.error(err instanceof Error ? err.message : String(err)); }
}

function stateColor(state: string): string {
  switch (state) {
    case 'online': return 'var(--nx-green)';
    case 'degraded': return 'var(--nx-amber)';
    case 'rebuilding': return 'var(--nx-blue, #409eff)';
    default: return 'var(--nx-text-faint)';
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1099511627776) return (bytes / 1099511627776).toFixed(1) + ' TB';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  return (bytes / 1048576).toFixed(0) + ' MB';
}
</script>

<template>
  <div class="raid-section">
    <div class="raid-header">
      <div class="nx-panel-title">{{ t('storage.raid.title') }}</div>
      <el-button size="small" type="primary" @click="showCreateDialog = true">{{ t('storage.raid.create') }}</el-button>
    </div>

    <div v-loading="loading" class="raid-grid">
      <div v-for="arr in arrays" :key="arr.name" class="raid-card">
        <div class="raid-card-header">
          <span class="raid-name nx-mono">{{ arr.name }}</span>
          <span class="raid-level">{{ arr.level.toUpperCase() }}</span>
          <span class="raid-state" :style="{ color: stateColor(arr.state) }">{{ arr.state }}</span>
        </div>
        <div class="raid-card-body">
          <div class="raid-info-row"><span class="raid-label">{{ t('storage.raid.devices') }}</span><span class="nx-mono">{{ arr.devices.join(', ') }}</span></div>
          <div v-if="arr.spares.length" class="raid-info-row"><span class="raid-label">{{ t('storage.raid.spares') }}</span><span class="nx-mono">{{ arr.spares.join(', ') }}</span></div>
          <div class="raid-info-row"><span class="raid-label">{{ t('storage.raid.capacity') }}</span><span>{{ formatBytes(arr.totalBytes) }}</span></div>
          <div v-if="arr.syncProgress !== null" class="raid-info-row">
            <span class="raid-label">{{ t('storage.raid.sync') }}</span>
            <el-progress :percentage="arr.syncProgress" :stroke-width="6" style="flex:1" />
          </div>
        </div>
        <div class="raid-card-actions">
          <el-button v-if="arr.state === 'degraded'" size="small" @click="rebuild(arr)">{{ t('storage.raid.rebuild') }}</el-button>
          <el-button size="small" type="danger" text @click="removeArray(arr)">{{ t('common.delete') }}</el-button>
        </div>
      </div>
      <div v-if="arrays.length === 0 && !loading" class="raid-empty nx-text-dim">{{ t('storage.raid.empty') }}</div>
    </div>

    <!-- 创建阵列对话框 -->
    <el-dialog v-model="showCreateDialog" :title="t('storage.raid.create')" width="480px">
      <el-form label-position="top">
        <el-form-item :label="t('storage.raid.name')">
          <el-input v-model="createForm.name" placeholder="md0" />
        </el-form-item>
        <el-form-item :label="t('storage.raid.level')">
          <el-select v-model="createForm.level" style="width: 100%">
            <el-option label="RAID 0" value="raid0" />
            <el-option label="RAID 1" value="raid1" />
            <el-option label="RAID 5" value="raid5" />
            <el-option label="RAID 6" value="raid6" />
            <el-option label="RAID 10" value="raid10" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('storage.raid.devices')">
          <el-input v-model="createForm.devices" placeholder="/dev/sdb, /dev/sdc" />
        </el-form-item>
        <el-form-item :label="t('storage.raid.spares')">
          <el-input v-model="createForm.spares" :placeholder="t('storage.raid.sparesPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createArray">{{ t('storage.raid.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.raid-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.raid-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.raid-card { border: 1px solid var(--nx-border-faint); padding: 12px; }
.raid-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.raid-name { font-weight: 700; }
.raid-level { font-size: 11px; border: 1px solid var(--nx-border-faint); padding: 1px 6px; }
.raid-state { font-size: 11px; margin-left: auto; }
.raid-info-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 2px 0; }
.raid-label { color: var(--nx-text-dim); min-width: 60px; }
.raid-card-actions { margin-top: 8px; display: flex; gap: 8px; }
.raid-empty { text-align: center; padding: 24px; }
</style>
