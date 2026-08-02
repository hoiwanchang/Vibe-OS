<script setup lang="ts">
/**
 * SSD 缓存管理（Phase 4）
 * 嵌入 StorageView
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ssdCacheApi } from '@/api';
import type { SsdCacheEntry, SsdCacheMode } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const caches = ref<SsdCacheEntry[]>([]);
const showCreateDialog = ref(false);
const createForm = ref({ ssdDevice: '', poolDevice: '', mode: 'read' as SsdCacheMode });

onMounted(async () => { await load(); });

async function load(): Promise<void> {
  loading.value = true;
  try { caches.value = await ssdCacheApi.list(); }
  catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
}

async function createCache(): Promise<void> {
  if (!createForm.value.ssdDevice || !createForm.value.poolDevice) {
    ElMessage.warning(t('storage.ssd.invalidCreate'));
    return;
  }
  try {
    await ssdCacheApi.create(createForm.value);
    ElMessage.success(t('storage.ssd.created'));
    showCreateDialog.value = false;
    await load();
  } catch (err) { ElMessage.error(err instanceof Error ? err.message : String(err)); }
}

async function removeCache(entry: SsdCacheEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(t('storage.ssd.removeConfirm', { name: entry.name }), t('common.warning'), { type: 'warning' });
    await ssdCacheApi.remove(entry.name);
    ElMessage.success(t('storage.ssd.removed'));
    await load();
  } catch { /* cancelled */ }
}
</script>

<template>
  <div class="ssd-section">
    <div class="ssd-header">
      <div class="nx-panel-title">{{ t('storage.ssd.title') }}</div>
      <el-button size="small" type="primary" @click="showCreateDialog = true">{{ t('storage.ssd.create') }}</el-button>
    </div>

    <el-table :data="caches" v-loading="loading" size="small" stripe>
      <el-table-column prop="name" :label="t('storage.ssd.colName')" width="120">
        <template #default="{ row }"><span class="nx-mono">{{ row.name }}</span></template>
      </el-table-column>
      <el-table-column prop="ssdDevice" :label="t('storage.ssd.colSsd')" width="120">
        <template #default="{ row }"><span class="nx-mono">{{ row.ssdDevice }}</span></template>
      </el-table-column>
      <el-table-column prop="poolDevice" :label="t('storage.ssd.colPool')" width="120">
        <template #default="{ row }"><span class="nx-mono">{{ row.poolDevice }}</span></template>
      </el-table-column>
      <el-table-column prop="mode" :label="t('storage.ssd.colMode')" width="100" />
      <el-table-column :label="t('storage.ssd.colHitRate')" width="100" align="center">
        <template #default="{ row }"><span class="nx-mono">{{ row.hitRate.toFixed(1) }}%</span></template>
      </el-table-column>
      <el-table-column :label="t('storage.ssd.colTemp')" width="80" align="center">
        <template #default="{ row }">{{ row.temperature !== null ? row.temperature + '°C' : '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('storage.ssd.colLife')" width="80" align="center">
        <template #default="{ row }">{{ row.lifePercent !== null ? row.lifePercent + '%' : '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('common.ops')" width="80">
        <template #default="{ row }">
          <el-button size="small" text type="danger" @click="removeCache(row)">{{ t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建缓存 -->
    <el-dialog v-model="showCreateDialog" :title="t('storage.ssd.create')" width="440px">
      <el-form label-position="top">
        <el-form-item :label="t('storage.ssd.colSsd')">
          <el-input v-model="createForm.ssdDevice" placeholder="/dev/nvme0n1" />
        </el-form-item>
        <el-form-item :label="t('storage.ssd.colPool')">
          <el-input v-model="createForm.poolDevice" placeholder="/dev/md0" />
        </el-form-item>
        <el-form-item :label="t('storage.ssd.colMode')">
          <el-select v-model="createForm.mode" style="width: 100%">
            <el-option :label="t('storage.ssd.modeRead')" value="read" />
            <el-option :label="t('storage.ssd.modeWrite')" value="write" />
            <el-option :label="t('storage.ssd.modeReadWrite')" value="readwrite" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createCache">{{ t('storage.ssd.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ssd-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
</style>
