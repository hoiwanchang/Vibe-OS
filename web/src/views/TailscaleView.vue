<script setup lang="ts">
/**
 * Tailscale 网络管理窗口
 * - 连接状态总览（后端状态 / 本节点 / 在线统计）
 * - 登录控制平面：支持第三方 headscale 服务器（--login-server）+ 预认证密钥
 * - 多账户管理：已登记账户列表，一键切换 / 移除
 * - 偏好设置：exit node 选择、接受子网路由、通告自身为 exit node
 * - 对等节点表格
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { tailscaleApi } from '@/api';
import type {
  TailscaleAccount,
  TailscaleManageReport,
  TailscalePrefs,
} from '@/api/types';
import { useSystemStore } from '@/stores/system';

const system = useSystemStore();
const { tailscale } = storeToRefs(system);

/** 管理综合报告（账户 + 偏好，独立于轮询状态） */
const manage = ref<TailscaleManageReport | null>(null);
const loading = ref(false);
const loginLoading = ref(false);

/** 登录表单 */
const loginForm = ref({
  controlUrl: '',
  authKey: '',
  label: '',
  exitNode: false,
  acceptRoutes: true,
});

/** 偏好设置表单 */
const prefsForm = ref<TailscalePrefs>({
  acceptRoutes: false,
  exitNode: '',
  exitNodeAllowLanAccess: false,
  advertiseExitNode: false,
});

/** 登录返回的认证 URL（需用户浏览器访问授权） */
const pendingAuthUrl = ref<string | null>(null);

/** 后端状态文案映射 */
const stateText = computed(() => {
  const s = tailscale.value?.status.backendState ?? 'Unknown';
  const map: Record<string, string> = {
    Running: '运行中',
    Stopped: '已停止',
    NotRunning: '未运行',
    Starting: '启动中',
    NeedsLogin: '需要登录',
    NotInstalled: '未安装',
  };
  return map[s] ?? s;
});

const selfOnline = computed(() => tailscale.value?.status.self?.online ?? false);

const onlinePeers = computed(() => {
  const peers = tailscale.value?.status.peers ?? [];
  return peers.filter((p) => p.online).length;
});

/** 可作为 exit node 的在线对等节点（供偏好设置选择） */
const exitNodeOptions = computed(() => {
  const peers = tailscale.value?.status.peers ?? [];
  return peers.filter((p) => p.online && p.ips.length > 0);
});

/** 拉取管理报告 */
async function fetchManage(): Promise<void> {
  loading.value = true;
  try {
    manage.value = await tailscaleApi.manage();
    if (manage.value) {
      prefsForm.value = { ...manage.value.prefs };
    }
  } catch {
    /* 后端不可用时保持空（演示模式无 manage 端点降级） */
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchManage();
});

/** 登录控制平面 */
async function doLogin(): Promise<void> {
  loginLoading.value = true;
  pendingAuthUrl.value = null;
  try {
    const res = await tailscaleApi.login({
      controlUrl: loginForm.value.controlUrl || undefined,
      authKey: loginForm.value.authKey || undefined,
      label: loginForm.value.label || undefined,
      exitNode: loginForm.value.exitNode,
      acceptRoutes: loginForm.value.acceptRoutes,
    });
    if (res.authUrl) {
      pendingAuthUrl.value = res.authUrl;
      ElMessage.warning('请在浏览器中打开认证链接完成授权');
    } else {
      ElMessage.success(`已登录：${res.account.label}`);
    }
    await fetchManage();
    await system.fetchAll();
  } catch (e) {
    ElMessage.error(`登录失败：${e instanceof Error ? e.message : String(e)}`);
  } finally {
    loginLoading.value = false;
  }
}

/** 登出 */
async function doLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定要登出当前 Tailscale 账户吗？', '登出确认', {
      confirmButtonText: '登出',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return; // 用户取消
  }
  try {
    await tailscaleApi.logout();
    ElMessage.success('已登出');
    await fetchManage();
    await system.fetchAll();
  } catch (e) {
    ElMessage.error(`登出失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 切换账户 */
async function switchAccount(account: TailscaleAccount): Promise<void> {
  try {
    const res = await tailscaleApi.switchAccount(account.id);
    if (res.authUrl) {
      pendingAuthUrl.value = res.authUrl;
      ElMessage.warning('该账户需要重新授权，请打开认证链接');
    } else {
      ElMessage.success(`已切换到：${account.label}`);
    }
    await fetchManage();
    await system.fetchAll();
  } catch (e) {
    ElMessage.error(`切换失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 移除账户 */
async function removeAccount(account: TailscaleAccount): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定移除账户「${account.label}」吗？（仅从列表移除，不影响运行状态）`,
      '移除账户',
      { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await tailscaleApi.removeAccount(account.id);
    ElMessage.success('已移除');
    await fetchManage();
  } catch (e) {
    ElMessage.error(`移除失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 应用偏好设置 */
async function applyPrefs(): Promise<void> {
  try {
    await tailscaleApi.setPrefs({ ...prefsForm.value });
    ElMessage.success('偏好设置已应用');
    await fetchManage();
  } catch (e) {
    ElMessage.error(`应用失败：${e instanceof Error ? e.message : String(e)}`);
  }
}
</script>

<template>
  <div class="ts-view">
    <!-- 状态总览 -->
    <div class="nx-grid nx-grid--stats ts-overview">
      <div class="nx-panel ts-stat">
        <div class="nx-metric-label">连接状态</div>
        <div class="ts-stat__value">
          <span class="nx-dot" :class="selfOnline ? 'nx-dot--ok' : 'nx-dot--error'" />
          {{ stateText }}
        </div>
      </div>
      <div class="nx-panel ts-stat">
        <div class="nx-metric-label">本节点</div>
        <div class="ts-stat__value nx-mono">{{ tailscale?.status.self?.hostname ?? '—' }}</div>
        <div class="ts-stat__sub nx-mono">{{ tailscale?.status.self?.ips.join(' / ') ?? '—' }}</div>
      </div>
      <div class="nx-panel ts-stat">
        <div class="nx-metric-label">在线节点</div>
        <div class="ts-stat__value nx-mono">
          {{ onlinePeers }} / {{ (tailscale?.status.peers ?? []).length }}
        </div>
      </div>
      <div class="nx-panel ts-stat">
        <div class="nx-metric-label">当前账户</div>
        <div class="ts-stat__value">
          {{ manage?.accounts.find((a) => a.active)?.label ?? '未登录' }}
        </div>
      </div>
    </div>

    <!-- 认证 URL 提示 -->
    <div v-if="pendingAuthUrl" class="nx-alert-banner nx-alert-banner--warning ts-authurl">
      <span class="nx-alert-title">需要浏览器授权</span>
      <a :href="pendingAuthUrl" target="_blank" rel="noopener" class="nx-mono ts-authurl__link">
        {{ pendingAuthUrl }}
      </a>
    </div>

    <div class="nx-grid nx-grid--two">
      <!-- 登录控制平面 -->
      <div class="nx-panel">
        <div class="ts-section-title">登录控制平面</div>
        <el-form label-position="top" size="default">
          <el-form-item label="控制平面地址（headscale 服务器 URL，留空使用官方）">
            <el-input
              v-model="loginForm.controlUrl"
              placeholder="http://headscale.example.com:8080"
              clearable
            />
          </el-form-item>
          <el-form-item label="预认证密钥（可选，headscale 免交互登录）">
            <el-input v-model="loginForm.authKey" placeholder="authkey…" show-password clearable />
          </el-form-item>
          <el-form-item label="账户标签（可选，默认取服务器主机名）">
            <el-input v-model="loginForm.label" placeholder="我的 headscale" clearable />
          </el-form-item>
          <div class="ts-login-opts">
            <el-checkbox v-model="loginForm.acceptRoutes">接受子网路由</el-checkbox>
            <el-checkbox v-model="loginForm.exitNode">通告为 Exit Node</el-checkbox>
          </div>
          <div class="ts-actions">
            <el-button type="primary" :loading="loginLoading" @click="doLogin">登录</el-button>
            <el-button :disabled="!selfOnline" @click="doLogout">登出</el-button>
          </div>
        </el-form>
      </div>

      <!-- 偏好设置 -->
      <div class="nx-panel">
        <div class="ts-section-title">路由偏好</div>
        <el-form label-position="top" size="default">
          <el-form-item label="Exit Node（出口节点）">
            <el-select v-model="prefsForm.exitNode" placeholder="不使用 Exit Node" clearable style="width: 100%">
              <el-option label="不使用" value="" />
              <el-option
                v-for="peer in exitNodeOptions"
                :key="peer.id"
                :label="`${peer.hostname} (${peer.ips[0]})`"
                :value="peer.ips[0] ?? ''"
              />
            </el-select>
          </el-form-item>
          <el-checkbox v-model="prefsForm.acceptRoutes">接受子网路由</el-checkbox>
          <el-checkbox v-model="prefsForm.exitNodeAllowLanAccess" style="margin-left: 16px">
            Exit Node 允许局域网访问
          </el-checkbox>
          <el-checkbox v-model="prefsForm.advertiseExitNode" style="margin-left: 16px">
            通告自身为 Exit Node
          </el-checkbox>
          <div class="ts-actions">
            <el-button type="primary" @click="applyPrefs">应用</el-button>
          </div>
        </el-form>
      </div>
    </div>

    <!-- 多账户管理 -->
    <div class="nx-panel ts-accounts">
      <div class="ts-section-title">已登记账户（多账户切换）</div>
      <div v-if="!manage || manage.accounts.length === 0" class="ts-empty">
        暂无已登记账户，登录后自动登记
      </div>
      <div v-else class="ts-account-list">
        <div
          v-for="account in manage.accounts"
          :key="account.id"
          class="ts-account"
          :class="{ 'ts-account--active': account.active }"
        >
          <span class="nx-dot" :class="account.active ? 'nx-dot--ok' : 'nx-dot--off'" />
          <div class="ts-account__info">
            <div class="ts-account__label">{{ account.label }}</div>
            <div class="ts-account__meta nx-mono">
              {{ account.controlUrl }}<span v-if="account.loginName"> · {{ account.loginName }}</span>
            </div>
          </div>
          <div class="ts-account__ops">
            <el-button v-if="!account.active" size="small" @click="switchAccount(account)">切换</el-button>
            <el-tag v-else type="success" size="small">当前</el-tag>
            <el-button size="small" type="danger" plain @click="removeAccount(account)">移除</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 对等节点 -->
    <div class="nx-panel">
      <div class="ts-section-title">对等节点</div>
      <el-table :data="tailscale?.status.peers ?? []" size="small" stripe>
        <el-table-column label="状态" width="70">
          <template #default="{ row }">
            <span class="nx-dot" :class="row.online ? 'nx-dot--ok' : 'nx-dot--off'" />
          </template>
        </el-table-column>
        <el-table-column prop="hostname" label="主机名" min-width="160" />
        <el-table-column label="IP 地址" min-width="180">
          <template #default="{ row }">
            <span class="nx-mono">{{ row.ips.join(', ') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="os" label="系统" width="100" />
        <el-table-column label="活跃" width="80">
          <template #default="{ row }">{{ row.active ? '是' : '否' }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.ts-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: fade-up 0.3s ease both;
}

.ts-overview {
  grid-template-columns: repeat(4, 1fr);
}

.ts-stat__value {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--nx-font-display);
  font-size: 20px;
  font-weight: 700;
  margin-top: 6px;
  color: var(--nx-text);
}

.ts-stat__sub {
  font-size: 11px;
  color: var(--nx-text-faint);
  margin-top: 4px;
  word-break: break-all;
}

.ts-section-title {
  font-family: var(--nx-font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--nx-amber);
  margin-bottom: 14px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--nx-border-faint);
}

.ts-authurl {
  flex-wrap: wrap;
}

.ts-authurl__link {
  color: var(--nx-amber);
  word-break: break-all;
  text-decoration: underline;
}

.ts-login-opts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.ts-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.ts-accounts {
  min-height: 80px;
}

.ts-empty {
  color: var(--nx-text-faint);
  font-size: 13px;
  padding: 8px 0;
}

.ts-account-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ts-account {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--nx-border-faint);
  background: var(--nx-bg-sunken);
}

.ts-account--active {
  border-color: var(--nx-amber);
  background: var(--nx-amber-dim);
}

.ts-account__info {
  flex: 1;
  min-width: 0;
}

.ts-account__label {
  font-weight: 600;
  font-size: 14px;
  color: var(--nx-text);
}

.ts-account__meta {
  font-size: 11px;
  color: var(--nx-text-faint);
  margin-top: 2px;
  word-break: break-all;
}

.ts-account__ops {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .ts-overview {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
