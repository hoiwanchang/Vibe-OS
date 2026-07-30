<script setup lang="ts">
/**
 * iSCSI Target 管理（Phase 4）
 * 嵌入 StorageView
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { iscsiApi } from '@/api';
import type { IscsiTarget } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const targets = ref<IscsiTarget[]>([]);
const showCreateDialog = ref(false);
const createForm = ref({ iqn: '', backingStore: '', sizeGb: 100, chapUser: '', chapPassword: '', whitelist: '' });

onMounted(async () => { await load(); });

async function load(): Promise<void> {
  loading.value = true;
  try { targets.value = await iscsiApi.listTargets(); }
  catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
}

async function createTarget(): Promise<void> {
  if (!createForm.value.iqn || !createForm.value.backingStore) {
    ElMessage.warning(t('storage.iscsi.invalidCreate'));
    return;
  }
  const whitelist = createForm.value.whitelist.split(',').map(s => s.trim()).filter(Boolean);
  try {
    await iscsiApi.createTarget({
      iqn: createForm.value.iqn,
      luns: [{ backingStore: createForm.value.backingStore, sizeBytes: createForm.value.sizeGb * 1073741824 }],
      chapUser: createForm.value.chapUser || undefined,
      chapPassword: createForm.value.chapPassword || undefined,
      initiatorWhitelist: whitelist.length ? whitelist : undefined,
    });
    ElMessage.success(t('storage.iscsi.created'));
    showCreateDialog.value = false;
    await load();
  } catch (err) { ElMessage.error(err instanceof Error ? err.message : String(err)); }
}

async function deleteTarget(tgt: IscsiTarget): Promise<void> {
  try {
    await ElMessageBox.confirm(t('storage.iscsi.deleteConfirm', { iqn: tgt.iqn }), t('common.warning'), { type: 'warning' });
    await iscsiApi.deleteTarget(tgt.iqn);
    ElMessage.success(t('storage.iscsi.deleted'));
    await load();
  } catch { /* cancelled */ }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1099511627776) return (bytes / 1099511627776).toFixed(1) + ' TB';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  return (bytes / 1048576).toFixed(0) + ' MB';
}
</script>

<template>
  <div class="iscsi-section">
    <div class="iscsi-header">
      <div class="nx-panel-title">{{ t('storage.iscsi.title') }}</div>
      <el-button size="small" type="primary" @click="showCreateDialog = true">{{ t('storage.iscsi.create') }}</el-button>
    </div>

    <div v-loading="loading" class="iscsi-list">
      <div v-for="tgt in targets" :key="tgt.iqn" class="iscsi-card">
        <div class="iscsi-card-header">
          <span class="iscsi-iqn nx-mono">{{ tgt.iqn }}</span>
          <span class="iscsi-conn">{{ tgt.connections }} {{ t('storage.iscsi.connections') }}</span>
          <span v-if="tgt.chapEnabled" class="iscsi-chap">CHAP</span>
        </div>
        <div class="iscsi-luns">
          <div v-for="lun in tgt.luns" :key="lun.lunId" class="iscsi-lun-row">
            <span class="nx-mono">LUN {{ lun.lunId }}</span>
            <span class="nx-mono">{{ lun.backingStore }}</span>
            <span>{{ formatBytes(lun.sizeBytes) }}</span>
          </div>
        </div>
        <div v-if="tgt.initiatorWhitelist.length" class="iscsi-whitelist">
          <span class="iscsi-label">{{ t('storage.iscsi.whitelist') }}</span>
          <span class="nx-mono">{{ tgt.initiatorWhitelist.join(', ') }}</span>
        </div>
        <div class="iscsi-card-actions">
          <el-button size="small" type="danger" text @click="deleteTarget(tgt)">{{ t('common.delete') }}</el-button>
        </div>
      </div>
      <div v-if="targets.length === 0 && !loading" class="iscsi-empty nx-text-dim">{{ t('storage.iscsi.empty') }}</div>
    </div>

    <!-- 创建 Target -->
    <el-dialog v-model="showCreateDialog" :title="t('storage.iscsi.create')" width="500px">
      <el-form label-position="top">
        <el-form-item label="IQN">
          <el-input v-model="createForm.iqn" placeholder="iqn.2026-07.com.vibeos:storage" />
        </el-form-item>
        <el-form-item :label="t('storage.iscsi.backingStore')">
          <el-input v-model="createForm.backingStore" placeholder="/dev/vg0/lv-data" />
        </el-form-item>
        <el-form-item :label="t('storage.iscsi.sizeGb')">
          <el-input-number v-model="createForm.sizeGb" :min="1" :max="102400" />
        </el-form-item>
        <el-form-item :label="t('storage.iscsi.chapUser')">
          <el-input v-model="createForm.chapUser" :placeholder="t('storage.iscsi.chapOptional')" />
        </el-form-item>
        <el-form-item :label="t('storage.iscsi.chapPassword')">
          <el-input v-model="createForm.chapPassword" type="password" show-password :placeholder="t('storage.iscsi.chapOptional')" />
        </el-form-item>
        <el-form-item :label="t('storage.iscsi.whitelist')">
          <el-input v-model="createForm.whitelist" :placeholder="t('storage.iscsi.whitelistPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createTarget">{{ t('storage.iscsi.create') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.iscsi-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.iscsi-list { display: flex; flex-direction: column; gap: 12px; }
.iscsi-card { border: 1px solid var(--nx-border-faint); padding: 12px; }
.iscsi-card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.iscsi-iqn { font-weight: 700; font-size: 13px; }
.iscsi-conn { font-size: 11px; color: var(--nx-text-dim); }
.iscsi-chap { font-size: 10px; border: 1px solid var(--nx-amber); color: var(--nx-amber); padding: 0 4px; }
.iscsi-luns { margin-bottom: 8px; }
.iscsi-lun-row { display: flex; gap: 16px; font-size: 12px; padding: 2px 0; }
.iscsi-whitelist { display: flex; gap: 8px; font-size: 11px; margin-bottom: 8px; }
.iscsi-label { color: var(--nx-text-dim); }
.iscsi-card-actions { display: flex; }
.iscsi-empty { text-align: center; padding: 24px; }
</style>
