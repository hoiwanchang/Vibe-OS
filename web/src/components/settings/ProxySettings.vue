<script setup lang="ts">
/**
 * 反向代理规则管理（Phase 2）
 * 嵌入设置中心 > 网络分区
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { proxyApi } from '@/api';
import type { ProxyRule, ProxyRuleInput, ProxyCert } from '@/api/types';

const { t } = useI18n();
const rules = ref<ProxyRule[]>([]);
const certs = ref<ProxyCert[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editingId = ref<string | null>(null);
const form = ref<ProxyRuleInput>({ domain: '', path: '/', target: '', https: false, websocket: false, enabled: true });

onMounted(async () => {
  loading.value = true;
  try {
    [rules.value, certs.value] = await Promise.all([proxyApi.getRules(), proxyApi.getCerts()]);
  } catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
});

function openCreate(): void {
  editingId.value = null;
  form.value = { domain: '', path: '/', target: '', https: false, websocket: false, enabled: true };
  dialogVisible.value = true;
}

function openEdit(row: ProxyRule): void {
  editingId.value = row.id;
  form.value = { domain: row.domain, path: row.path, target: row.target, https: row.https, websocket: row.websocket, enabled: row.enabled };
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  try {
    if (editingId.value) {
      await proxyApi.updateRule(editingId.value, form.value);
      ElMessage.success(t('common.saved'));
    } else {
      await proxyApi.createRule(form.value);
      ElMessage.success(t('settings.proxy.created'));
    }
    rules.value = await proxyApi.getRules();
    dialogVisible.value = false;
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function remove(row: ProxyRule): Promise<void> {
  try {
    await ElMessageBox.confirm(t('settings.proxy.deleteConfirm', { domain: row.domain }), t('common.warning'), { type: 'warning' });
    await proxyApi.deleteRule(row.id);
    rules.value = await proxyApi.getRules();
    ElMessage.success(t('common.deleted'));
  } catch { /* cancelled */ }
}

async function reload(): Promise<void> {
  try {
    await proxyApi.reload();
    ElMessage.success(t('settings.proxy.reloaded'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function genCert(): Promise<void> {
  try {
    const domain = rules.value.find(r => r.https)?.domain ?? 'nas.local';
    await proxyApi.createCert({ domain, selfSigned: true });
    certs.value = await proxyApi.getCerts();
    ElMessage.success(t('settings.proxy.certGenerated'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="proxy-settings">
    <div class="proxy-header">
      <div class="nx-panel-title">{{ t('settings.proxy.title') }}</div>
      <div class="proxy-actions">
        <el-button size="small" @click="reload">{{ t('settings.proxy.reload') }}</el-button>
        <el-button size="small" @click="genCert">{{ t('settings.proxy.genCert') }}</el-button>
        <el-button size="small" type="primary" @click="openCreate">{{ t('settings.proxy.addRule') }}</el-button>
      </div>
    </div>

    <el-table :data="rules" v-loading="loading" size="small" stripe>
      <el-table-column prop="domain" :label="t('settings.proxy.colDomain')" min-width="140" />
      <el-table-column prop="path" :label="t('settings.proxy.colPath')" width="80" />
      <el-table-column prop="target" :label="t('settings.proxy.colTarget')" min-width="140">
        <template #default="{ row }"><span class="nx-mono">{{ row.target }}</span></template>
      </el-table-column>
      <el-table-column :label="t('settings.proxy.colHttps')" width="70" align="center">
        <template #default="{ row }">
          <span :style="{ color: row.https ? 'var(--nx-green)' : 'var(--nx-text-faint)' }">{{ row.https ? 'HTTPS' : 'HTTP' }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('settings.proxy.colWs')" width="50" align="center">
        <template #default="{ row }">{{ row.websocket ? '✓' : '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="80" align="center">
        <template #default="{ row }">
          <span :class="row.enabled ? 'dot dot--green' : 'dot dot--gray'" />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.ops')" width="120">
        <template #default="{ row }">
          <el-button size="small" text @click="openEdit(row)">{{ t('common.edit') }}</el-button>
          <el-button size="small" text type="danger" @click="remove(row)">{{ t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 证书列表 -->
    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.proxy.certs') }}</div>
    <el-table :data="certs" size="small" stripe>
      <el-table-column prop="domain" :label="t('settings.proxy.colDomain')" min-width="140" />
      <el-table-column prop="issuer" :label="t('settings.proxy.colIssuer')" min-width="120" />
      <el-table-column prop="notAfter" :label="t('settings.proxy.colExpiry')" width="160" />
      <el-table-column :label="t('settings.proxy.colType')" width="80">
        <template #default="{ row }">{{ row.selfSigned ? t('settings.proxy.selfSigned') : 'CA' }}</template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? t('settings.proxy.editRule') : t('settings.proxy.addRule')" width="500px">
      <el-form label-position="top">
        <el-form-item :label="t('settings.proxy.colDomain')">
          <el-input v-model="form.domain" placeholder="app.example.com" />
        </el-form-item>
        <el-form-item :label="t('settings.proxy.colPath')">
          <el-input v-model="form.path" placeholder="/" />
        </el-form-item>
        <el-form-item :label="t('settings.proxy.colTarget')">
          <el-input v-model="form.target" placeholder="127.0.0.1:8080" />
        </el-form-item>
        <el-form-item :label="t('settings.proxy.colHttps')">
          <el-switch v-model="form.https" />
        </el-form-item>
        <el-form-item :label="t('settings.proxy.colWs')">
          <el-switch v-model="form.websocket" />
        </el-form-item>
        <el-form-item :label="t('common.enabled')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.proxy-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.proxy-actions { display: flex; gap: 8px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot--green { background: var(--nx-green); }
.dot--gray { background: var(--nx-text-faint); }
</style>
