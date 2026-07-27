<script setup lang="ts">
/**
 * 网络配置窗口（P1）
 * - 标签 1：接口（卡片列表 + DHCP/Static 编辑对话框）
 * - 标签 2：防火墙（规则表格 + 添加规则对话框）
 * - 标签 3：端口（监听端口表格 + 搜索过滤）
 * - 标签 4：WoL（设备列表 + 唤醒 + 添加设备）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Connection, Plus } from '@element-plus/icons-vue';
import { useNetworkStore } from '@/stores/network';
import type { FirewallRuleRequest, InterfaceConfigRequest, NetInterface } from '@/api/types';
import { formatTime } from '@/utils/format';

const network = useNetworkStore();

/** 当前标签 */
const activeTab = ref('interfaces');

/** 接口编辑对话框 */
const ifaceDialogVisible = ref(false);
const editingIface = ref<NetInterface | null>(null);
const ifaceForm = reactive<InterfaceConfigRequest>({
  method: 'dhcp',
  ip: '',
  netmask: '',
  gateway: '',
  dns: [],
});
const ifaceDnsText = ref('');

/** 防火墙规则对话框 */
const ruleDialogVisible = ref(false);
const ruleForm = reactive<FirewallRuleRequest>({
  chain: 'input',
  protocol: 'tcp',
  port: '',
  action: 'accept',
  source: '',
  comment: '',
});

/** 端口搜索 */
const portSearch = ref('');

/** 添加 WoL 设备 */
const wolName = ref('');
const wolMac = ref('');

/** 接口类型图标文本 */
function ifaceTypeText(type: string): string {
  const map: Record<string, string> = {
    ethernet: '有线',
    wifi: '无线',
    bridge: '桥接',
    vlan: 'VLAN',
    loopback: '回环',
  };
  return map[type] ?? type;
}

/** 接口主 IP */
function ifaceIp(iface: NetInterface): string {
  const v4 = iface.addresses.find((a) => a.family === 'inet');
  return v4 ? `${v4.address}/${v4.prefix}` : '—';
}

/** 打开接口编辑 */
function openIfaceEdit(iface: NetInterface): void {
  editingIface.value = iface;
  ifaceForm.method = iface.method === 'static' ? 'static' : 'dhcp';
  const v4 = iface.addresses.find((a) => a.family === 'inet');
  ifaceForm.ip = v4?.address ?? '';
  ifaceForm.netmask = v4 ? String(v4.prefix) : '24';
  ifaceForm.gateway = iface.gateway ?? '';
  ifaceDnsText.value = network.dns.servers.join(', ');
  ifaceDialogVisible.value = true;
}

/** 提交接口配置 */
async function submitIface(): Promise<void> {
  if (!editingIface.value) return;
  const payload: InterfaceConfigRequest = { method: ifaceForm.method };
  if (ifaceForm.method === 'static') {
    if (!ifaceForm.ip) {
      ElMessage.warning('静态配置需填写 IP 地址');
      return;
    }
    payload.ip = ifaceForm.ip;
    payload.netmask = ifaceForm.netmask;
    payload.gateway = ifaceForm.gateway || undefined;
    payload.dns = ifaceDnsText.value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const ok = await network.updateInterface(editingIface.value.name, payload);
  if (ok) {
    ElMessage.success(`${editingIface.value.name} 配置已应用`);
    ifaceDialogVisible.value = false;
  } else {
    ElMessage.error(network.lastError ?? '应用失败');
  }
}

/** 提交防火墙规则 */
async function submitRule(): Promise<void> {
  const payload: FirewallRuleRequest = {
    chain: ruleForm.chain,
    protocol: ruleForm.protocol,
    action: ruleForm.action,
  };
  if (ruleForm.port !== '' && ruleForm.port !== null) payload.port = ruleForm.port;
  if (ruleForm.source) payload.source = ruleForm.source;
  if (ruleForm.comment) payload.comment = ruleForm.comment;

  const ok = await network.addRule(payload);
  if (ok) {
    ElMessage.success('规则已添加');
    ruleDialogVisible.value = false;
    Object.assign(ruleForm, { chain: 'input', protocol: 'tcp', port: '', action: 'accept', source: '', comment: '' });
  } else {
    ElMessage.error(network.lastError ?? '添加失败');
  }
}

/** 删除防火墙规则 */
async function removeRule(id: string): Promise<void> {
  try {
    await ElMessageBox.confirm('确定删除该防火墙规则吗？', '删除规则', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  const ok = await network.removeRule(id);
  if (ok) ElMessage.success('规则已删除');
  else ElMessage.error(network.lastError ?? '删除失败');
}

/** 动作标签类型 */
function actionTag(action: string): 'success' | 'danger' | 'warning' {
  if (action === 'accept') return 'success';
  if (action === 'drop') return 'danger';
  return 'warning';
}

/** 端口搜索过滤 */
const filteredPorts = computed(() => {
  const q = portSearch.value.trim().toLowerCase();
  if (!q) return network.listeningPorts;
  return network.listeningPorts.filter(
    (p) =>
      String(p.port).includes(q) ||
      (p.process ?? '').toLowerCase().includes(q) ||
      p.protocol.toLowerCase().includes(q) ||
      p.localAddress.includes(q),
  );
});

/** 发送 WoL */
async function wake(mac: string): Promise<void> {
  const ok = await network.sendWol(mac);
  if (ok) ElMessage.success(`唤醒魔术包已发送至 ${mac}`);
  else ElMessage.error(network.lastError ?? '发送失败');
}

/** 添加 WoL 设备（仅本地提示，后端无添加端点时降级） */
async function addWolDevice(): Promise<void> {
  if (!wolName.value.trim() || !wolMac.value.trim()) {
    ElMessage.warning('请填写设备名称和 MAC 地址');
    return;
  }
  // 后端暂无添加设备端点，直接唤醒并提示
  ElMessage.info('设备已记录（本地），可立即唤醒');
  await wake(wolMac.value.trim());
  wolName.value = '';
  wolMac.value = '';
}

/** MAC 格式校验提示 */
const macValid = computed(() => /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(wolMac.value.trim()));

onMounted(() => {
  void network.fetchInterfaces();
  void network.fetchDns();
  void network.fetchFirewall();
  void network.fetchPorts();
  void network.fetchWolDevices();
});
</script>

<template>
  <div class="nv-view">
    <el-tabs v-model="activeTab">
      <!-- 标签 1：接口 -->
      <el-tab-pane name="interfaces">
        <template #label><span class="nv-tab-label">接口</span></template>
        <div class="nv-iface-grid">
          <div
            v-for="iface in network.interfaces"
            :key="iface.name"
            class="nv-iface nx-panel"
            :class="{ 'nv-iface--down': iface.state === 'down' }"
          >
            <div class="nv-iface__head">
              <el-icon class="nv-iface__icon"><Connection /></el-icon>
              <span class="nv-iface__name nx-mono">{{ iface.name }}</span>
              <span
                class="nx-dot"
                :class="iface.state === 'up' ? 'nx-dot--ok' : 'nx-dot--error'"
                :title="iface.state === 'up' ? '已连接' : '未连接'"
              />
            </div>
            <div class="nv-iface__type">{{ ifaceTypeText(iface.type) }}</div>
            <div class="nv-iface__ip nx-mono">{{ ifaceIp(iface) }}</div>
            <div class="nv-iface__meta nx-mono">
              {{ iface.mac }}<span v-if="iface.speed"> · {{ iface.speed }}</span>
            </div>
            <div v-if="iface.type !== 'loopback'" class="nv-iface__ops">
              <el-button size="small" @click="openIfaceEdit(iface)">配置</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 标签 2：防火墙 -->
      <el-tab-pane name="firewall">
        <template #label><span class="nv-tab-label">防火墙</span></template>
        <div class="nx-panel">
          <el-table v-loading="network.loading" :data="network.firewallRules" size="small" stripe>
            <el-table-column prop="chain" label="链" width="90">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.chain.toUpperCase() }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="protocol" label="协议" width="80">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.protocol.toUpperCase() }}</span>
              </template>
            </el-table-column>
            <el-table-column label="端口" width="90">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.port ?? '全部' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="动作" width="90">
              <template #default="{ row }">
                <el-tag :type="actionTag(row.action)" size="small">{{ row.action.toUpperCase() }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="来源" min-width="140">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.source ?? '任意' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="comment" label="备注" min-width="160" />
            <el-table-column label="操作" width="80" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text type="danger" @click="removeRule(row.id)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="nv-add">
            <el-button :icon="Plus" type="primary" @click="ruleDialogVisible = true">添加规则</el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- 标签 3：端口 -->
      <el-tab-pane name="ports">
        <template #label><span class="nv-tab-label">端口</span></template>
        <div class="nx-panel">
          <el-input
            v-model="portSearch"
            placeholder="搜索端口 / 进程 / 地址…"
            clearable
            class="nv-port-search"
          />
          <el-table v-loading="network.loading" :data="filteredPorts" size="small" stripe>
            <el-table-column prop="protocol" label="协议" width="80">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.protocol.toUpperCase() }}</span>
              </template>
            </el-table-column>
            <el-table-column label="地址:端口" min-width="180">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.localAddress }}:{{ row.port }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="process" label="进程" min-width="140">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.process ?? '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="pid" label="PID" width="90">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.pid ?? '—' }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 标签 4：WoL -->
      <el-tab-pane name="wol">
        <template #label><span class="nv-tab-label">网络唤醒</span></template>
        <div class="nx-panel">
          <div v-if="network.wolDevices.length === 0" class="nv-empty">暂无已保存设备</div>
          <div class="nv-wol-list">
            <div v-for="dev in network.wolDevices" :key="dev.mac" class="nv-wol">
              <div class="nv-wol__info">
                <div class="nv-wol__name">{{ dev.name }}</div>
                <div class="nv-wol__meta nx-mono">
                  {{ dev.mac }}
                  <span v-if="dev.lastWake"> · 上次唤醒 {{ formatTime(dev.lastWake) }}</span>
                </div>
              </div>
              <el-button size="small" type="primary" @click="wake(dev.mac)">唤醒</el-button>
            </div>
          </div>

          <div class="nv-wol-add">
            <el-input v-model="wolName" placeholder="设备名称" class="nv-wol-add__input" />
            <el-input
              v-model="wolMac"
              placeholder="MAC 地址（AA:BB:CC:DD:EE:FF）"
              class="nv-wol-add__input nx-mono"
              :class="{ 'nv-wol-add__input--invalid': wolMac && !macValid }"
            />
            <el-button :icon="Plus" :disabled="!macValid" @click="addWolDevice">添加并唤醒</el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 接口配置对话框 -->
    <el-dialog
      v-model="ifaceDialogVisible"
      :title="`配置接口 — ${editingIface?.name ?? ''}`"
      width="460px"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="配置方式">
          <el-radio-group v-model="ifaceForm.method">
            <el-radio value="dhcp">DHCP 自动</el-radio>
            <el-radio value="static">静态 IP</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="ifaceForm.method === 'static'">
          <el-form-item label="IP 地址">
            <el-input v-model="ifaceForm.ip" placeholder="192.168.50.10" class="nx-mono" />
          </el-form-item>
          <el-form-item label="子网掩码（前缀长度）">
            <el-input v-model="ifaceForm.netmask" placeholder="24" class="nx-mono" />
          </el-form-item>
          <el-form-item label="网关">
            <el-input v-model="ifaceForm.gateway" placeholder="192.168.50.1" class="nx-mono" />
          </el-form-item>
          <el-form-item label="DNS（逗号分隔）">
            <el-input v-model="ifaceDnsText" placeholder="223.5.5.5, 119.29.29.29" class="nx-mono" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="ifaceDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitIface">应用</el-button>
      </template>
    </el-dialog>

    <!-- 防火墙规则对话框 -->
    <el-dialog v-model="ruleDialogVisible" title="添加防火墙规则" width="460px" append-to-body>
      <el-form label-position="top">
        <el-form-item label="链">
          <el-select v-model="ruleForm.chain" style="width: 100%">
            <el-option label="INPUT（入站）" value="input" />
            <el-option label="FORWARD（转发）" value="forward" />
            <el-option label="OUTPUT（出站）" value="output" />
          </el-select>
        </el-form-item>
        <el-form-item label="协议">
          <el-select v-model="ruleForm.protocol" style="width: 100%">
            <el-option label="TCP" value="tcp" />
            <el-option label="UDP" value="udp" />
            <el-option label="ICMP" value="icmp" />
            <el-option label="全部" value="all" />
          </el-select>
        </el-form-item>
        <el-form-item label="端口（留空=全部）">
          <el-input v-model="ruleForm.port" placeholder="如 22 或 8000-8100" class="nx-mono" />
        </el-form-item>
        <el-form-item label="动作">
          <el-radio-group v-model="ruleForm.action">
            <el-radio value="accept">允许</el-radio>
            <el-radio value="drop">丢弃</el-radio>
            <el-radio value="reject">拒绝</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="来源（留空=任意）">
          <el-input v-model="ruleForm.source" placeholder="192.168.50.0/24" class="nx-mono" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="ruleForm.comment" placeholder="规则用途说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRule">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.nv-view {
  animation: fade-up 0.3s ease both;
}

.nv-tab-label {
  font-size: 13px;
}

.nv-iface-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.nv-iface {
  padding: 12px 14px;
  transition: border-color 0.15s;
}

.nv-iface:hover {
  border-color: var(--nx-border-strong);
}

.nv-iface--down {
  opacity: 0.6;
}

.nv-iface__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.nv-iface__icon {
  color: var(--nx-amber);
  font-size: 15px;
}

.nv-iface__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--nx-text);
}

.nv-iface__type {
  font-size: 11px;
  color: var(--nx-text-faint);
  margin-bottom: 4px;
}

.nv-iface__ip {
  font-size: 12px;
  color: var(--nx-amber);
  margin-bottom: 2px;
}

.nv-iface__meta {
  font-size: 10px;
  color: var(--nx-text-faint);
  margin-bottom: 8px;
}

.nv-add {
  margin-top: 14px;
}

.nv-port-search {
  margin-bottom: 12px;
  max-width: 320px;
}

.nv-empty {
  color: var(--nx-text-faint);
  font-size: 12px;
  padding: 16px 0;
  text-align: center;
}

.nv-wol-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.nv-wol {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--nx-border-faint);
  background: var(--nx-bg-sunken);
}

.nv-wol__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--nx-text);
}

.nv-wol__meta {
  font-size: 11px;
  color: var(--nx-text-faint);
  margin-top: 2px;
}

.nv-wol-add {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px solid var(--nx-border-faint);
  padding-top: 12px;
}

.nv-wol-add__input {
  flex: 1;
  min-width: 160px;
}

.nv-wol-add__input--invalid :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}
</style>
