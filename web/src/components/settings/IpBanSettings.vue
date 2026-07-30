<script setup lang="ts">
/**
 * IP 封禁管理（Phase 3）
 * 嵌入设置中心 > 安全分区
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { securityApi } from '@/api';
import type { BannedIpEntry, SecurityPolicy } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const bannedList = ref<BannedIpEntry[]>([]);
const policy = ref<SecurityPolicy | null>(null);
const banIp = ref('');
const banReason = ref('');
const showBanDialog = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    [bannedList.value, policy.value] = await Promise.all([
      securityApi.getBanned(),
      securityApi.getPolicy(),
    ]);
  } catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
});

function openBan(): void {
  banIp.value = '';
  banReason.value = '';
  showBanDialog.value = true;
}

async function confirmBan(): Promise<void> {
  if (!banIp.value.trim()) {
    ElMessage.warning(t('settings.ipban.invalidIp'));
    return;
  }
  try {
    await securityApi.ban(banIp.value.trim(), banReason.value || undefined);
    ElMessage.success(t('settings.ipban.banned', { ip: banIp.value }));
    showBanDialog.value = false;
    bannedList.value = await securityApi.getBanned();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function unban(entry: BannedIpEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(t('settings.ipban.unbanConfirm', { ip: entry.ip }), t('common.warning'), { type: 'warning' });
    await securityApi.unban(entry.ip);
    ElMessage.success(t('settings.ipban.unbanned', { ip: entry.ip }));
    bannedList.value = await securityApi.getBanned();
  } catch { /* cancelled */ }
}

async function savePolicy(): Promise<void> {
  if (!policy.value) return;
  try {
    await securityApi.updatePolicy(policy.value);
    ElMessage.success(t('common.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

function isExpired(entry: BannedIpEntry): boolean {
  if (!entry.expiresAt) return false;
  return new Date(entry.expiresAt) < new Date();
}
</script>

<template>
  <div class="ipban-settings">
    <div class="ipban-header">
      <div class="nx-panel-title">{{ t('settings.ipban.title') }}</div>
      <el-button size="small" type="primary" @click="openBan">{{ t('settings.ipban.ban') }}</el-button>
    </div>

    <!-- 封禁列表 -->
    <el-table :data="bannedList" v-loading="loading" size="small" stripe>
      <el-table-column prop="ip" label="IP" width="140">
        <template #default="{ row }"><span class="nx-mono">{{ row.ip }}</span></template>
      </el-table-column>
      <el-table-column prop="reason" :label="t('settings.ipban.colReason')" min-width="140" />
      <el-table-column prop="bannedAt" :label="t('settings.ipban.colBannedAt')" width="160" />
      <el-table-column :label="t('settings.ipban.colExpires')" width="160">
        <template #default="{ row }">
          <span v-if="!row.expiresAt">{{ t('settings.ipban.permanent') }}</span>
          <span v-else-if="isExpired(row)" style="color: var(--nx-text-faint)">{{ t('settings.ipban.expired') }}</span>
          <span v-else class="nx-mono">{{ row.expiresAt }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('settings.ipban.colType')" width="70" align="center">
        <template #default="{ row }">
          <span :style="{ color: row.auto ? 'var(--nx-amber)' : 'var(--nx-text-dim)' }">
            {{ row.auto ? t('settings.ipban.auto') : t('settings.ipban.manual') }}
          </span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.ops')" width="80">
        <template #default="{ row }">
          <el-button size="small" text type="danger" @click="unban(row)">{{ t('settings.ipban.unban') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 封禁策略 -->
    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.ipban.policy') }}</div>
    <template v-if="policy">
      <el-form label-position="top" class="settings-form">
        <el-form-item :label="t('settings.ipban.maxAttempts')">
          <el-input-number v-model="policy.maxAttempts" :min="1" :max="100" />
        </el-form-item>
        <el-form-item :label="t('settings.ipban.banDuration')">
          <el-input-number v-model="policy.banDurationHours" :min="0" :max="8760" />
          <span class="ipban-unit">{{ t('settings.ipban.hours') }}</span>
        </el-form-item>
        <el-form-item :label="t('settings.ipban.whitelist')">
          <el-select v-model="policy.whitelist" multiple filterable allow-create :placeholder="t('settings.ipban.whitelistPlaceholder')" style="width: 100%">
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="savePolicy">{{ t('common.saveChanges') }}</el-button>
        </el-form-item>
      </el-form>
    </template>

    <!-- 手动封禁对话框 -->
    <el-dialog v-model="showBanDialog" :title="t('settings.ipban.ban')" width="400px">
      <el-form label-position="top">
        <el-form-item label="IP">
          <el-input v-model="banIp" placeholder="192.168.1.100" />
        </el-form-item>
        <el-form-item :label="t('settings.ipban.colReason')">
          <el-input v-model="banReason" :placeholder="t('settings.ipban.reasonPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBanDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="danger" @click="confirmBan">{{ t('settings.ipban.ban') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ipban-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.ipban-unit { margin-left: 8px; color: var(--nx-text-dim); font-size: 12px; }
</style>
