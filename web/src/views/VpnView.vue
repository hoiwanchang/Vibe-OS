<script setup lang="ts">
/**
 * VPN 管理窗口（Phase 6）
 * WireGuard 服务端：状态 / Peer 管理 / 配置导出
 */
import { onMounted, ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Download } from '@element-plus/icons-vue';
import { vpnApi } from '@/api';
import type { VpnServerStatus, VpnPeer } from '@/api/types';

const { t } = useI18n();

const status = ref<VpnServerStatus | null>(null);
const peers = ref<VpnPeer[]>([]);
const peerDialogVisible = ref(false);
const peerForm = reactive({ name: '', allowedIps: '' });

async function loadStatus() {
  try {
    status.value = await vpnApi.status();
  } catch { status.value = null; }
}

async function loadPeers() {
  try {
    peers.value = await vpnApi.listPeers() ?? [];
  } catch { peers.value = []; }
}

async function addPeer() {
  try {
    await vpnApi.addPeer({
      name: peerForm.name,
      allowedIps: peerForm.allowedIps ? peerForm.allowedIps.split(',').map((s) => s.trim()) : undefined,
    });
    ElMessage.success(t('vpn.peerAdded'));
    peerDialogVisible.value = false;
    peerForm.name = '';
    peerForm.allowedIps = '';
    await loadPeers();
  } catch { ElMessage.error(t('common.operationFailed')); }
}

async function removePeer(pubkey: string) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  try {
    await vpnApi.removePeer(pubkey);
    ElMessage.success(t('common.deleted'));
    await loadPeers();
  } catch { ElMessage.error(t('common.operationFailed')); }
}

async function exportConfig(pubkey: string) {
  try {
    const config = await vpnApi.peerConfig(pubkey);
    const blob = new Blob([String(config)], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wg-peer-${pubkey.slice(0, 8)}.conf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch { ElMessage.error(t('common.operationFailed')); }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

onMounted(() => {
  void loadStatus();
  void loadPeers();
});
</script>

<template>
  <div class="vpn-view nx-panel">
    <!-- 服务状态 -->
    <div class="vpn-status">
      <div class="vpn-status__row">
        <span class="vpn-status__label">{{ t('vpn.serverStatus') }}</span>
        <el-tag :type="status?.running ? 'success' : 'danger'" size="small">
          {{ status?.running ? t('vpn.running') : t('vpn.stopped') }}
        </el-tag>
      </div>
      <template v-if="status">
        <div class="vpn-status__row">
          <span class="vpn-status__label">{{ t('vpn.port') }}</span>
          <span class="nx-mono">{{ status.port }}</span>
        </div>
        <div class="vpn-status__row">
          <span class="vpn-status__label">{{ t('vpn.subnet') }}</span>
          <span class="nx-mono">{{ status.subnet }}</span>
        </div>
        <div class="vpn-status__row">
          <span class="vpn-status__label">{{ t('vpn.publicKey') }}</span>
          <span class="nx-mono vpn-status__key">{{ status.publicKey }}</span>
        </div>
      </template>
    </div>

    <!-- Peer 列表 -->
    <div class="vpn-peers">
      <div class="vpn-peers__header">
        <span class="vpn-peers__title">{{ t('vpn.peers') }}</span>
        <el-button size="small" :icon="Plus" @click="peerDialogVisible = true">{{ t('vpn.addPeer') }}</el-button>
      </div>
      <el-table :data="peers" size="small" class="nx-mono">
        <el-table-column prop="name" label="Name" width="120" />
        <el-table-column prop="publicKey" label="Public Key" min-width="200">
          <template #default="{ row }">
            <span class="vpn-key">{{ row.publicKey.slice(0, 16) }}...</span>
          </template>
        </el-table-column>
        <el-table-column label="Allowed IPs" width="150">
          <template #default="{ row }">{{ (row.allowedIps ?? []).join(', ') }}</template>
        </el-table-column>
        <el-table-column label="Transfer" width="140">
          <template #default="{ row }">↓{{ formatBytes(row.transferRx) }} ↑{{ formatBytes(row.transferTx) }}</template>
        </el-table-column>
        <el-table-column label="" width="120">
          <template #default="{ row }">
            <el-button size="small" text :icon="Download" @click="exportConfig(row.publicKey)" />
            <el-button size="small" type="danger" text @click="removePeer(row.publicKey)">{{ t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 添加 Peer 对话框 -->
    <el-dialog v-model="peerDialogVisible" :title="t('vpn.addPeer')" width="420px">
      <el-form label-width="100px" size="small">
        <el-form-item :label="t('vpn.peerName')">
          <el-input v-model="peerForm.name" class="nx-mono" />
        </el-form-item>
        <el-form-item :label="t('vpn.allowedIps')">
          <el-input v-model="peerForm.allowedIps" placeholder="10.0.0.2/32" class="nx-mono" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="peerDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="addPeer">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.vpn-view {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow-y: auto;
}
.vpn-status {
  border: 1px solid var(--nx-border);
  padding: 12px;
}
.vpn-status__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}
.vpn-status__label {
  width: 100px;
  color: var(--nx-text-secondary);
  font-size: 12px;
}
.vpn-status__key {
  font-size: 11px;
  word-break: break-all;
}
.vpn-peers__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.vpn-peers__title {
  font-size: 13px;
  font-weight: 600;
}
.vpn-key {
  font-size: 11px;
  color: var(--nx-text-secondary);
}
</style>
