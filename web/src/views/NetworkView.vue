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
import { useI18n } from 'vue-i18n';
import { useNetworkStore } from '@/stores/network';
import type { FirewallRuleRequest, InterfaceConfigRequest, NetInterface, VlanInterface, BondInterface, QosRule, DnsRecord } from '@/api/types';
import { vlanApi, lacpApi, qosApi, dnsApi } from '@/api';
import { formatTime } from '@/utils/format';

const network = useNetworkStore();
const { t } = useI18n();

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
    ethernet: t('network.ifaceTypes.ethernet'),
    wifi: t('network.ifaceTypes.wifi'),
    bridge: t('network.ifaceTypes.bridge'),
    vlan: 'VLAN',
    loopback: t('network.ifaceTypes.loopback'),
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
      ElMessage.warning(t('network.staticNeedsIp'));
      return;
    }
    payload.ip = ifaceForm.ip;
    payload.netmask = ifaceForm.netmask;
    payload.gateway = ifaceForm.gateway || undefined;
    payload.dns = ifaceDnsText.value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const ok = await network.updateInterface(editingIface.value.name, payload);
  if (ok) {
    ElMessage.success(t('network.ifaceApplied', { name: editingIface.value.name }));
    ifaceDialogVisible.value = false;
  } else {
    ElMessage.error(network.lastError ?? t('network.applyFailed'));
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
    ElMessage.success(t('network.ruleAdded'));
    ruleDialogVisible.value = false;
    Object.assign(ruleForm, { chain: 'input', protocol: 'tcp', port: '', action: 'accept', source: '', comment: '' });
  } else {
    ElMessage.error(network.lastError ?? t('network.addFailed'));
  }
}

/** 删除防火墙规则 */
async function removeRule(id: string): Promise<void> {
  try {
    await ElMessageBox.confirm(t('network.deleteRuleConfirm'), t('network.deleteRuleTitle'), {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    });
  } catch {
    return;
  }
  const ok = await network.removeRule(id);
  if (ok) ElMessage.success(t('network.ruleDeleted'));
  else ElMessage.error(network.lastError ?? t('network.deleteFailed'));
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
  if (ok) ElMessage.success(t('network.wolSent', { mac }));
  else ElMessage.error(network.lastError ?? t('network.sendFailed'));
}

/** 添加 WoL 设备（仅本地提示，后端无添加端点时降级） */
async function addWolDevice(): Promise<void> {
  if (!wolName.value.trim() || !wolMac.value.trim()) {
    ElMessage.warning(t('network.fillWolFields'));
    return;
  }
  // 后端暂无添加设备端点，直接唤醒并提示
  ElMessage.info(t('network.wolSaved'));
  await wake(wolMac.value.trim());
  wolName.value = '';
  wolMac.value = '';
}

/** MAC 格式校验提示 */
const macValid = computed(() => /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(wolMac.value.trim()));

/* ---------- Phase 6: VLAN ---------- */
const vlanList = ref<VlanInterface[]>([]);
const vlanDialogVisible = ref(false);
const vlanForm = reactive({ parentInterface: '', vlanId: 10, ipAddress: '' });

async function loadVlans() {
  try {
    const res = await vlanApi.list();
    vlanList.value = res ?? [];
  } catch { /* ignore */ }
}

async function createVlan() {
  try {
    await vlanApi.create({ parentInterface: vlanForm.parentInterface, vlanId: vlanForm.vlanId, ipAddress: vlanForm.ipAddress || undefined });
    ElMessage.success(t('network.vlanCreated'));
    vlanDialogVisible.value = false;
    await loadVlans();
  } catch { ElMessage.error(t('common.operationFailed')); }
}

async function removeVlan(id: string) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  try {
    await vlanApi.remove(id);
    ElMessage.success(t('common.deleted'));
    await loadVlans();
  } catch { ElMessage.error(t('common.operationFailed')); }
}

/* ---------- Phase 6: LACP ---------- */
const lacpList = ref<BondInterface[]>([]);
const lacpDialogVisible = ref(false);
const lacpForm = reactive({ name: 'bond0', mode: '802.3ad' as const, members: '' });

async function loadLacp() {
  try {
    const res = await lacpApi.list();
    lacpList.value = res ?? [];
  } catch { /* ignore */ }
}

async function createLacp() {
  try {
    await lacpApi.create({ name: lacpForm.name, mode: lacpForm.mode, members: lacpForm.members.split(',').map((s) => s.trim()).filter(Boolean) });
    ElMessage.success(t('network.lacpCreated'));
    lacpDialogVisible.value = false;
    await loadLacp();
  } catch { ElMessage.error(t('common.operationFailed')); }
}

async function removeLacp(name: string) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  try {
    await lacpApi.remove(name);
    ElMessage.success(t('common.deleted'));
    await loadLacp();
  } catch { ElMessage.error(t('common.operationFailed')); }
}

/* ---------- Phase 6: QoS ---------- */
const qosRules = ref<QosRule[]>([]);
const qosDialogVisible = ref(false);
const qosForm = reactive({ interface: 'eth0', type: 'ip' as const, target: '', direction: 'egress' as const, rateLimit: '10mbit', priority: 1 });

async function loadQos() {
  try {
    const res = await qosApi.listRules();
    qosRules.value = res ?? [];
  } catch { /* ignore */ }
}

async function createQosRule() {
  try {
    await qosApi.createRule({ interface: qosForm.interface, type: qosForm.type, target: qosForm.target, direction: qosForm.direction, rateLimit: qosForm.rateLimit, priority: qosForm.priority });
    ElMessage.success(t('network.qosCreated'));
    qosDialogVisible.value = false;
    await loadQos();
  } catch { ElMessage.error(t('common.operationFailed')); }
}

async function removeQosRule(id: string) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  try {
    await qosApi.removeRule(id);
    ElMessage.success(t('common.deleted'));
    await loadQos();
  } catch { ElMessage.error(t('common.operationFailed')); }
}

/* ---------- Phase 6: DNS ---------- */
const dnsRecords = ref<DnsRecord[]>([]);
const dnsDialogVisible = ref(false);
const dnsForm = reactive({ type: 'A' as const, name: '', value: '', ttl: 3600 });

async function loadDns() {
  try {
    const res = await dnsApi.listRecords();
    dnsRecords.value = res ?? [];
  } catch { /* ignore */ }
}

async function createDnsRecord() {
  try {
    await dnsApi.addRecord({ type: dnsForm.type, name: dnsForm.name, value: dnsForm.value, ttl: dnsForm.ttl });
    ElMessage.success(t('network.dnsCreated'));
    dnsDialogVisible.value = false;
    await loadDns();
  } catch { ElMessage.error(t('common.operationFailed')); }
}

async function removeDnsRecord(id: string) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  try {
    await dnsApi.removeRecord(id);
    ElMessage.success(t('common.deleted'));
    await loadDns();
  } catch { ElMessage.error(t('common.operationFailed')); }
}

onMounted(() => {
  void network.fetchInterfaces();
  void network.fetchDns();
  void network.fetchFirewall();
  void network.fetchPorts();
  void network.fetchWolDevices();
  void loadVlans();
  void loadLacp();
  void loadQos();
  void loadDns();
});
</script>

<template>
  <div class="nv-view">
    <el-tabs v-model="activeTab">
      <!-- 标签 1：接口 -->
      <el-tab-pane name="interfaces">
        <template #label><span class="nv-tab-label">{{ t('network.tabInterfaces') }}</span></template>
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
                :title="iface.state === 'up' ? t('common.connected') : t('common.disconnected')"
              />
            </div>
            <div class="nv-iface__type">{{ ifaceTypeText(iface.type) }}</div>
            <div class="nv-iface__ip nx-mono">{{ ifaceIp(iface) }}</div>
            <div class="nv-iface__meta nx-mono">
              {{ iface.mac }}<span v-if="iface.speed"> · {{ iface.speed }}</span>
            </div>
            <div v-if="iface.type !== 'loopback'" class="nv-iface__ops">
              <el-button size="small" @click="openIfaceEdit(iface)">{{ t('common.config') }}</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 标签 2：防火墙 -->
      <el-tab-pane name="firewall">
        <template #label><span class="nv-tab-label">{{ t('network.tabFirewall') }}</span></template>
        <div class="nx-panel">
          <el-table v-loading="network.loading" :data="network.firewallRules" size="small" stripe>
            <el-table-column prop="chain" :label="t('common.chain')" width="90">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.chain.toUpperCase() }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="protocol" :label="t('common.protocol')" width="80">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.protocol.toUpperCase() }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.port')" width="90">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.port ?? t('network.colAll') }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.action')" width="90">
              <template #default="{ row }">
                <el-tag :type="actionTag(row.action)" size="small">{{ row.action.toUpperCase() }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('common.source')" min-width="140">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.source ?? t('network.colAny') }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="comment" :label="t('common.remark')" min-width="160" />
            <el-table-column :label="t('common.ops')" width="80" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text type="danger" @click="removeRule(row.id)">{{ t('common.delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="nv-add">
            <el-button :icon="Plus" type="primary" @click="ruleDialogVisible = true">{{ t('network.addRuleTitle') }}</el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- 标签 3：端口 -->
      <el-tab-pane name="ports">
        <template #label><span class="nv-tab-label">{{ t('network.tabPorts') }}</span></template>
        <div class="nx-panel">
          <el-input
            v-model="portSearch"
            :placeholder="t('network.searchPorts')"
            clearable
            class="nv-port-search"
          />
          <el-table v-loading="network.loading" :data="filteredPorts" size="small" stripe>
            <el-table-column prop="protocol" :label="t('common.protocol')" width="80">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.protocol.toUpperCase() }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('network.addrPort')" min-width="180">
              <template #default="{ row }">
                <span class="nx-mono">{{ row.localAddress }}:{{ row.port }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="process" :label="t('common.process')" min-width="140">
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
        <template #label><span class="nv-tab-label">{{ t('network.tabWol') }}</span></template>
        <div class="nx-panel">
          <div v-if="network.wolDevices.length === 0" class="nv-empty">{{ t('network.noWolDevices') }}</div>
          <div class="nv-wol-list">
            <div v-for="dev in network.wolDevices" :key="dev.mac" class="nv-wol">
              <div class="nv-wol__info">
                <div class="nv-wol__name">{{ dev.name }}</div>
                <div class="nv-wol__meta nx-mono">
                  {{ dev.mac }}
                  <span v-if="dev.lastWake">{{ t('network.lastWake', { time: formatTime(dev.lastWake) }) }}</span>
                </div>
              </div>
              <el-button size="small" type="primary" @click="wake(dev.mac)">{{ t('common.wake') }}</el-button>
            </div>
          </div>

          <div class="nv-wol-add">
            <el-input v-model="wolName" :placeholder="t('network.deviceName')" class="nv-wol-add__input" />
            <el-input
              v-model="wolMac"
              :placeholder="t('network.macPh')"
              class="nv-wol-add__input nx-mono"
              :class="{ 'nv-wol-add__input--invalid': wolMac && !macValid }"
            />
            <el-button :icon="Plus" :disabled="!macValid" @click="addWolDevice">{{ t('network.addAndWake') }}</el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- Phase 6: VLAN -->
      <el-tab-pane name="vlan">
        <template #label><span class="nv-tab-label">{{ t('network.tabVlan') }}</span></template>
        <div class="nv-section">
          <div class="nv-section__header">
            <el-button size="small" :icon="Plus" @click="vlanDialogVisible = true">{{ t('network.vlanAdd') }}</el-button>
          </div>
          <el-table :data="vlanList" size="small" class="nx-mono">
            <el-table-column prop="parentInterface" label="Parent" width="120" />
            <el-table-column prop="vlanId" label="VLAN ID" width="90" />
            <el-table-column prop="ipAddress" label="IP" width="150" />
            <el-table-column prop="state" label="State" width="90" />
            <el-table-column prop="mtu" label="MTU" width="80" />
            <el-table-column label="" width="80">
              <template #default="{ row }">
                <el-button size="small" type="danger" text @click="removeVlan(row.id)">{{ t('common.delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- Phase 6: LACP -->
      <el-tab-pane name="lacp">
        <template #label><span class="nv-tab-label">{{ t('network.tabLacp') }}</span></template>
        <div class="nv-section">
          <div class="nv-section__header">
            <el-button size="small" :icon="Plus" @click="lacpDialogVisible = true">{{ t('network.lacpAdd') }}</el-button>
          </div>
          <el-table :data="lacpList" size="small" class="nx-mono">
            <el-table-column prop="name" label="Name" width="120" />
            <el-table-column prop="mode" label="Mode" width="120" />
            <el-table-column prop="aggregateSpeed" label="Speed" width="100" />
            <el-table-column prop="state" label="State" width="90" />
            <el-table-column label="Members">
              <template #default="{ row }">
                <el-tag v-for="m in row.members" :key="m.name" size="small" class="nv-tag" :type="m.state === 'up' ? 'success' : 'danger'">{{ m.name }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="" width="80">
              <template #default="{ row }">
                <el-button size="small" type="danger" text @click="removeLacp(row.name)">{{ t('common.delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- Phase 6: QoS -->
      <el-tab-pane name="qos">
        <template #label><span class="nv-tab-label">{{ t('network.tabQos') }}</span></template>
        <div class="nv-section">
          <div class="nv-section__header">
            <el-button size="small" :icon="Plus" @click="qosDialogVisible = true">{{ t('network.qosAdd') }}</el-button>
          </div>
          <el-table :data="qosRules" size="small" class="nx-mono">
            <el-table-column prop="interface" label="Interface" width="100" />
            <el-table-column prop="type" label="Type" width="80" />
            <el-table-column prop="target" label="Target" width="150" />
            <el-table-column prop="direction" label="Dir" width="80" />
            <el-table-column prop="rateLimit" label="Rate" width="100" />
            <el-table-column prop="priority" label="Prio" width="60" />
            <el-table-column label="" width="80">
              <template #default="{ row }">
                <el-button size="small" type="danger" text @click="removeQosRule(row.id)">{{ t('common.delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- Phase 6: DNS -->
      <el-tab-pane name="dns">
        <template #label><span class="nv-tab-label">{{ t('network.tabDns') }}</span></template>
        <div class="nv-section">
          <div class="nv-section__header">
            <el-button size="small" :icon="Plus" @click="dnsDialogVisible = true">{{ t('network.dnsAdd') }}</el-button>
          </div>
          <el-table :data="dnsRecords" size="small" class="nx-mono">
            <el-table-column prop="type" label="Type" width="80" />
            <el-table-column prop="name" label="Name" width="200" />
            <el-table-column prop="value" label="Value" width="200" />
            <el-table-column prop="ttl" label="TTL" width="80" />
            <el-table-column label="" width="80">
              <template #default="{ row }">
                <el-button size="small" type="danger" text @click="removeDnsRecord(row.id)">{{ t('common.delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 接口配置对话框 -->
    <el-dialog
      v-model="ifaceDialogVisible"
      :title="t('network.configIface', { name: editingIface?.name ?? '' })"
      width="460px"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item :label="t('network.configMethod')">
          <el-radio-group v-model="ifaceForm.method">
            <el-radio value="dhcp">{{ t('network.dhcp') }}</el-radio>
            <el-radio value="static">{{ t('network.static') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="ifaceForm.method === 'static'">
          <el-form-item :label="t('network.ipAddress')">
            <el-input v-model="ifaceForm.ip" placeholder="192.168.50.10" class="nx-mono" />
          </el-form-item>
          <el-form-item :label="t('network.subnet')">
            <el-input v-model="ifaceForm.netmask" placeholder="24" class="nx-mono" />
          </el-form-item>
          <el-form-item :label="t('network.gateway')">
            <el-input v-model="ifaceForm.gateway" placeholder="192.168.50.1" class="nx-mono" />
          </el-form-item>
          <el-form-item :label="t('network.dns')">
            <el-input v-model="ifaceDnsText" placeholder="223.5.5.5, 119.29.29.29" class="nx-mono" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="ifaceDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitIface">{{ t('common.apply') }}</el-button>
      </template>
    </el-dialog>

    <!-- 防火墙规则对话框 -->
    <el-dialog v-model="ruleDialogVisible" :title="t('network.addRuleTitle')" width="460px" append-to-body>
      <el-form label-position="top">
        <el-form-item :label="t('common.chain')">
          <el-select v-model="ruleForm.chain" style="width: 100%">
            <el-option :label="t('network.chainInput')" value="input" />
            <el-option :label="t('network.chainForward')" value="forward" />
            <el-option :label="t('network.chainOutput')" value="output" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.protocol')">
          <el-select v-model="ruleForm.protocol" style="width: 100%">
            <el-option label="TCP" value="tcp" />
            <el-option label="UDP" value="udp" />
            <el-option label="ICMP" value="icmp" />
            <el-option :label="t('common.all')" value="all" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('network.portLabel')">
          <el-input v-model="ruleForm.port" :placeholder="t('network.portPh')" class="nx-mono" />
        </el-form-item>
        <el-form-item :label="t('common.action')">
          <el-radio-group v-model="ruleForm.action">
            <el-radio value="accept">{{ t('network.actionAccept') }}</el-radio>
            <el-radio value="drop">{{ t('network.actionDrop') }}</el-radio>
            <el-radio value="reject">{{ t('network.actionReject') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('network.sourceLabel')">
          <el-input v-model="ruleForm.source" placeholder="192.168.50.0/24" class="nx-mono" />
        </el-form-item>
        <el-form-item :label="t('common.remark')">
          <el-input v-model="ruleForm.comment" :placeholder="t('network.ruleComment')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitRule">{{ t('common.add') }}</el-button>
      </template>
    </el-dialog>

    <!-- Phase 6: VLAN 对话框 -->
    <el-dialog v-model="vlanDialogVisible" :title="t('network.vlanAdd')" width="420px" append-to-body>
      <el-form label-width="110px" size="small">
        <el-form-item label="Parent">
          <el-input v-model="vlanForm.parentInterface" placeholder="eth0" class="nx-mono" />
        </el-form-item>
        <el-form-item label="VLAN ID">
          <el-input-number v-model="vlanForm.vlanId" :min="1" :max="4094" />
        </el-form-item>
        <el-form-item label="IP (optional)">
          <el-input v-model="vlanForm.ipAddress" placeholder="192.168.10.1/24" class="nx-mono" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="vlanDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createVlan">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Phase 6: LACP 对话框 -->
    <el-dialog v-model="lacpDialogVisible" :title="t('network.lacpAdd')" width="420px" append-to-body>
      <el-form label-width="110px" size="small">
        <el-form-item label="Name">
          <el-input v-model="lacpForm.name" placeholder="bond0" class="nx-mono" />
        </el-form-item>
        <el-form-item label="Mode">
          <el-select v-model="lacpForm.mode">
            <el-option label="802.3ad (LACP)" value="802.3ad" />
            <el-option label="balance-rr" value="balance-rr" />
            <el-option label="active-backup" value="active-backup" />
            <el-option label="balance-xor" value="balance-xor" />
          </el-select>
        </el-form-item>
        <el-form-item label="Members">
          <el-input v-model="lacpForm.members" placeholder="eth0,eth1" class="nx-mono" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="lacpDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createLacp">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Phase 6: QoS 对话框 -->
    <el-dialog v-model="qosDialogVisible" :title="t('network.qosAdd')" width="420px" append-to-body>
      <el-form label-width="110px" size="small">
        <el-form-item label="Interface">
          <el-input v-model="qosForm.interface" placeholder="eth0" class="nx-mono" />
        </el-form-item>
        <el-form-item label="Type">
          <el-select v-model="qosForm.type">
            <el-option label="IP" value="ip" />
            <el-option label="Port" value="port" />
            <el-option label="Protocol" value="protocol" />
          </el-select>
        </el-form-item>
        <el-form-item label="Target">
          <el-input v-model="qosForm.target" placeholder="192.168.1.0/24" class="nx-mono" />
        </el-form-item>
        <el-form-item label="Direction">
          <el-select v-model="qosForm.direction">
            <el-option label="Egress" value="egress" />
            <el-option label="Ingress" value="ingress" />
          </el-select>
        </el-form-item>
        <el-form-item label="Rate Limit">
          <el-input v-model="qosForm.rateLimit" placeholder="10mbit" class="nx-mono" />
        </el-form-item>
        <el-form-item label="Priority">
          <el-input-number v-model="qosForm.priority" :min="1" :max="10" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="qosDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createQosRule">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- Phase 6: DNS 对话框 -->
    <el-dialog v-model="dnsDialogVisible" :title="t('network.dnsAdd')" width="420px" append-to-body>
      <el-form label-width="110px" size="small">
        <el-form-item label="Type">
          <el-select v-model="dnsForm.type">
            <el-option label="A" value="A" />
            <el-option label="CNAME" value="CNAME" />
            <el-option label="PTR" value="PTR" />
          </el-select>
        </el-form-item>
        <el-form-item label="Name">
          <el-input v-model="dnsForm.name" placeholder="nas.local" class="nx-mono" />
        </el-form-item>
        <el-form-item label="Value">
          <el-input v-model="dnsForm.value" placeholder="192.168.1.100" class="nx-mono" />
        </el-form-item>
        <el-form-item label="TTL">
          <el-input-number v-model="dnsForm.ttl" :min="60" :max="86400" :step="300" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dnsDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createDnsRecord">{{ t('common.confirm') }}</el-button>
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
