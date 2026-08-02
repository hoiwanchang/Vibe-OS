<script setup lang="ts">
/**
 * LUKS 卷加密管理（Phase 4）
 * 嵌入 StorageView
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { luksApi } from '@/api';
import type { LuksVolume } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const volumes = ref<LuksVolume[]>([]);
const showCreateDialog = ref(false);
const showOpenDialog = ref(false);
const createForm = ref({ device: '', passphrase: '', useKeyfile: false });
const openForm = ref({ device: '', name: '', passphrase: '' });

onMounted(async () => { await load(); });

async function load(): Promise<void> {
  loading.value = true;
  try { volumes.value = await luksApi.list(); }
  catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
}

async function createVolume(): Promise<void> {
  if (!createForm.value.device) { ElMessage.warning(t('storage.luks.invalidDevice')); return; }
  try {
    await luksApi.create({
      device: createForm.value.device,
      passphrase: createForm.value.useKeyfile ? undefined : createForm.value.passphrase,
      keyfile: createForm.value.useKeyfile,
    });
    ElMessage.success(t('storage.luks.created'));
    showCreateDialog.value = false;
    await load();
  } catch (err) { ElMessage.error(err instanceof Error ? err.message : String(err)); }
}

async function openVolume(): Promise<void> {
  if (!openForm.value.device || !openForm.value.name) { ElMessage.warning(t('storage.luks.invalidOpen')); return; }
  try {
    await luksApi.open(openForm.value.device, openForm.value.name, openForm.value.passphrase || undefined);
    ElMessage.success(t('storage.luks.opened'));
    showOpenDialog.value = false;
    await load();
  } catch (err) { ElMessage.error(err instanceof Error ? err.message : String(err)); }
}

async function closeVolume(vol: LuksVolume): Promise<void> {
  try {
    await ElMessageBox.confirm(t('storage.luks.closeConfirm', { name: vol.name }), t('common.warning'), { type: 'warning' });
    await luksApi.close(vol.name);
    ElMessage.success(t('storage.luks.closed'));
    await load();
  } catch { /* cancelled */ }
}

async function toggleAutoUnlock(vol: LuksVolume): Promise<void> {
  try {
    await luksApi.setAutoUnlock(vol.name, !vol.autoUnlock);
    ElMessage.success(t('common.saved'));
    await load();
  } catch (err) { ElMessage.error(err instanceof Error ? err.message : String(err)); }
}

async function genKeyfile(vol: LuksVolume): Promise<void> {
  try {
    const res = await luksApi.generateKeyfile(vol.name);
    ElMessage.success(t('storage.luks.keyfileGenerated', { path: res.path }));
  } catch (err) { ElMessage.error(err instanceof Error ? err.message : String(err)); }
}
</script>

<template>
  <div class="luks-section">
    <div class="luks-header">
      <div class="nx-panel-title">{{ t('storage.luks.title') }}</div>
      <div class="luks-actions">
        <el-button size="small" @click="showOpenDialog = true">{{ t('storage.luks.open') }}</el-button>
        <el-button size="small" type="primary" @click="showCreateDialog = true">{{ t('storage.luks.create') }}</el-button>
      </div>
    </div>

    <el-table :data="volumes" v-loading="loading" size="small" stripe>
      <el-table-column prop="name" :label="t('storage.luks.colName')" width="120">
        <template #default="{ row }"><span class="nx-mono">{{ row.name }}</span></template>
      </el-table-column>
      <el-table-column prop="device" :label="t('storage.luks.colDevice')" width="140">
        <template #default="{ row }"><span class="nx-mono">{{ row.device }}</span></template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="90" align="center">
        <template #default="{ row }">
          <span :style="{ color: row.active ? 'var(--nx-green)' : 'var(--nx-text-faint)' }">
            {{ row.active ? t('storage.luks.unlocked') : t('storage.luks.locked') }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="cipher" :label="t('storage.luks.colCipher')" min-width="140" />
      <el-table-column :label="t('storage.luks.colAutoUnlock')" width="100" align="center">
        <template #default="{ row }">
          <el-switch :model-value="row.autoUnlock" size="small" @change="toggleAutoUnlock(row)" />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.ops')" width="180">
        <template #default="{ row }">
          <el-button v-if="row.active" size="small" text type="warning" @click="closeVolume(row)">{{ t('storage.luks.lock') }}</el-button>
          <el-button size="small" text @click="genKeyfile(row)">{{ t('storage.luks.keyfile') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建加密卷 -->
    <el-dialog v-model="showCreateDialog" :title="t('storage.luks.create')" width="440px">
      <el-form label-position="top">
        <el-form-item :label="t('storage.luks.colDevice')">
          <el-input v-model="createForm.device" placeholder="/dev/sdd" />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="createForm.useKeyfile">{{ t('storage.luks.useKeyfile') }}</el-checkbox>
        </el-form-item>
        <el-form-item v-if="!createForm.useKeyfile" :label="t('storage.luks.passphrase')">
          <el-input v-model="createForm.passphrase" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createVolume">{{ t('storage.luks.create') }}</el-button>
      </template>
    </el-dialog>

    <!-- 解锁卷 -->
    <el-dialog v-model="showOpenDialog" :title="t('storage.luks.open')" width="440px">
      <el-form label-position="top">
        <el-form-item :label="t('storage.luks.colDevice')">
          <el-input v-model="openForm.device" placeholder="/dev/sdd" />
        </el-form-item>
        <el-form-item :label="t('storage.luks.colName')">
          <el-input v-model="openForm.name" placeholder="encrypted-data" />
        </el-form-item>
        <el-form-item :label="t('storage.luks.passphrase')">
          <el-input v-model="openForm.passphrase" type="password" show-password :placeholder="t('storage.luks.passphraseOptional')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showOpenDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="openVolume">{{ t('storage.luks.open') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.luks-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.luks-actions { display: flex; gap: 8px; }
</style>
