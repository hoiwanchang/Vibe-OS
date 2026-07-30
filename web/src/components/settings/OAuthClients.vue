<script setup lang="ts">
/**
 * OAuth 客户端管理面板 — 嵌入设置中心
 */
import { ref, onMounted } from 'vue';
import { request } from '@/api/client';
import { ElMessage, ElMessageBox } from 'element-plus';

interface OAuthClient {
  id: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
  enabled: boolean;
  createdAt: string;
}

const clients = ref<OAuthClient[]>([]);
const loading = ref(false);
const showCreate = ref(false);
const showSecret = ref(false);
const newSecret = ref('');
const form = ref({ name: '', redirectUris: '', scopes: ['openid', 'profile', 'email'], grantTypes: ['authorization_code', 'refresh_token'] });

async function load() {
  loading.value = true;
  try {
    clients.value = await request<OAuthClient[]>({ method: 'GET', url: '/oauth/clients' });
  } catch { /* ignore */ }
  loading.value = false;
}

async function create() {
  const uris = form.value.redirectUris.split('\n').map(s => s.trim()).filter(Boolean);
  if (!form.value.name.trim() || !uris.length) {
    ElMessage.warning('名称和回调地址必填');
    return;
  }
  try {
    const res = await request<{ id: string; secret: string }>({
      method: 'POST', url: '/oauth/clients',
      data: { name: form.value.name, redirectUris: uris, scopes: form.value.scopes, grantTypes: form.value.grantTypes },
    });
    showCreate.value = false;
    newSecret.value = res.secret;
    showSecret.value = true;
    form.value = { name: '', redirectUris: '', scopes: ['openid', 'profile', 'email'], grantTypes: ['authorization_code', 'refresh_token'] };
    await load();
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '创建失败');
  }
}

async function toggleEnabled(client: OAuthClient) {
  await request({ method: 'PUT', url: `/oauth/clients/${client.id}`, data: { enabled: !client.enabled } });
  await load();
}

async function remove(client: OAuthClient) {
  await ElMessageBox.confirm(`确定删除客户端「${client.name}」？`, '删除', { type: 'warning' });
  await request({ method: 'DELETE', url: `/oauth/clients/${client.id}` });
  await load();
}

async function resetSecret(client: OAuthClient) {
  await ElMessageBox.confirm(`重置「${client.name}」的密钥？旧密钥将立即失效。`, '重置密钥', { type: 'warning' });
  const res = await request<{ secret: string }>({ method: 'POST', url: `/oauth/clients/${client.id}/reset-secret` });
  newSecret.value = res.secret;
  showSecret.value = true;
}

function copySecret() {
  navigator.clipboard.writeText(newSecret.value);
}

onMounted(load);
</script>

<template>
  <div class="oauth-panel">
    <div class="panel-header">
      <h3>应用授权（OAuth 客户端）</h3>
      <el-button type="primary" size="small" @click="showCreate = true">注册客户端</el-button>
    </div>

    <el-table :data="clients" v-loading="loading" size="small" stripe>
      <el-table-column prop="name" label="名称" width="160" />
      <el-table-column prop="id" label="Client ID" width="200">
        <template #default="{ row }"><code class="mono">{{ row.id }}</code></template>
      </el-table-column>
      <el-table-column prop="scopes" label="Scope" width="180">
        <template #default="{ row }">{{ row.scopes.join(', ') }}</template>
      </el-table-column>
      <el-table-column prop="enabled" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'danger'" size="small">{{ row.enabled ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="200">
        <template #default="{ row }">
          <el-button size="small" link @click="toggleEnabled(row)">{{ row.enabled ? '禁用' : '启用' }}</el-button>
          <el-button size="small" link @click="resetSecret(row)">重置密钥</el-button>
          <el-button size="small" link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建对话框 -->
    <el-dialog v-model="showCreate" title="注册 OAuth 客户端" width="480px">
      <el-form label-position="top">
        <el-form-item label="名称"><el-input v-model="form.name" placeholder="如 Nextcloud" /></el-form-item>
        <el-form-item label="回调地址（每行一个）">
          <el-input v-model="form.redirectUris" type="textarea" :rows="3" placeholder="http://app.local/oauth/callback" />
        </el-form-item>
        <el-form-item label="Scope">
          <el-checkbox-group v-model="form.scopes">
            <el-checkbox value="openid">openid</el-checkbox>
            <el-checkbox value="profile">profile</el-checkbox>
            <el-checkbox value="email">email</el-checkbox>
            <el-checkbox value="groups">groups</el-checkbox>
            <el-checkbox value="offline_access">offline_access</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="Grant Types">
          <el-checkbox-group v-model="form.grantTypes">
            <el-checkbox value="authorization_code">authorization_code</el-checkbox>
            <el-checkbox value="refresh_token">refresh_token</el-checkbox>
            <el-checkbox value="client_credentials">client_credentials</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="create">创建</el-button>
      </template>
    </el-dialog>

    <!-- Secret 展示对话框 -->
    <el-dialog v-model="showSecret" title="客户端密钥" width="480px" :close-on-click-modal="false">
      <el-alert type="warning" :closable="false" title="此密钥仅显示一次，关闭后无法再查看。请妥善保存。" style="margin-bottom:12px" />
      <el-input :model-value="newSecret" readonly>
        <template #append><el-button @click="copySecret">复制</el-button></template>
      </el-input>
      <template #footer><el-button type="primary" @click="showSecret = false">我已保存</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.panel-header h3 { margin: 0; color: #f0a500; font-family: 'Chakra Petch', monospace; }
.mono { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #aaa; }
</style>
