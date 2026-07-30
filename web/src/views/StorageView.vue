<script setup lang="ts">
/**
 * 存储池管理窗口（P0）
 * - 物理磁盘横向卡片：型号 / 容量 / 温度 / SMART 状态色
 * - 存储池列表：RAID 级别 / 盘数 / 使用率进度条 / 状态徽章
 * - 创建池向导：选磁盘 → 选 RAID 级别 → 确认
 * - Scrub：启动后轮询进度
 * - 销毁：二次确认 + 输入池名
 * - 扩容：选择未使用磁盘
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Coin, Plus } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { useStorageStore } from '@/stores/storage';
import type { CreatePoolRequest, DiskSmartDetail } from '@/api/types';
import { formatBytes, usageLevel } from '@/utils/format';
import RaidManager from '@/components/storage/RaidManager.vue';
import LuksManager from '@/components/storage/LuksManager.vue';
import SsdCacheManager from '@/components/storage/SsdCacheManager.vue';
import IscsiManager from '@/components/storage/IscsiManager.vue';

const storage = useStorageStore();
const { t } = useI18n();

/** 创建池对话框 */
const createVisible = ref(false);
const createForm = ref<CreatePoolRequest>({ name: '', level: 'raid1', disks: [] });
const creating = ref(false);

/** SMART 详情对话框 */
const smartVisible = ref(false);
const smartPool = ref('');
const smartDetails = ref<DiskSmartDetail[]>([]);

/** 扩容对话框 */
const expandVisible = ref(false);
const expandPool = ref('');
const expandDisks = ref<string[]>([]);

/** Scrub 轮询定时器 */
let scrubTimer: ReturnType<typeof setInterval> | null = null;

/** RAID 级别选项（含最少盘数约束） */
const raidLevels = [
  { value: 'raid0', label: t('storage.raidLabels.raid0'), min: 2 },
  { value: 'raid1', label: t('storage.raidLabels.raid1'), min: 2 },
  { value: 'raid5', label: t('storage.raidLabels.raid5'), min: 3 },
  { value: 'raid6', label: t('storage.raidLabels.raid6'), min: 4 },
  { value: 'raid10', label: t('storage.raidLabels.raid10'), min: 4 },
  { value: 'jbod', label: t('storage.raidLabels.jbod'), min: 1 },
] as const;

/** 可选磁盘（未加入任何池） */
const freeDisks = computed(() => storage.freeDisks());

/** SMART 状态色 */
function smartColor(healthy: boolean): string {
  return healthy ? 'var(--el-color-success)' : 'var(--el-color-danger)';
}

/** 池状态徽章类型 */
function poolTagType(state: string): 'success' | 'warning' | 'danger' | 'info' {
  if (state === 'active') return 'success';
  if (state === 'degraded') return 'warning';
  if (state === 'rebuilding') return 'danger';
  return 'info';
}

/** 池状态中文 */
function poolStateText(state: string): string {
  const map: Record<string, string> = {
    active: t('common.normal'),
    degraded: t('common.degraded'),
    rebuilding: t('common.rebuilding'),
    inactive: t('common.inactive'),
  };
  return map[state] ?? state;
}

/** 创建池：校验盘数 */
const createDiskValid = computed(() => {
  const level = raidLevels.find((l) => l.value === createForm.value.level);
  return createForm.value.disks.length >= (level?.min ?? 1);
});

/** 提交创建池 */
async function submitCreate(): Promise<void> {
  if (!createForm.value.name.trim()) {
    ElMessage.warning(t('storage.enterPoolName'));
    return;
  }
  if (!createDiskValid.value) {
    ElMessage.warning(t('storage.diskCountMismatch'));
    return;
  }
  creating.value = true;
  const ok = await storage.createPool({ ...createForm.value });
  creating.value = false;
  if (ok) {
    ElMessage.success(t('storage.poolCreated', { name: createForm.value.name }));
    createVisible.value = false;
    createForm.value = { name: '', level: 'raid1', disks: [] };
  } else {
    ElMessage.error(storage.lastError ?? t('storage.createFailed'));
  }
}

/** 销毁池（输入池名二次确认） */
async function destroyPool(name: string): Promise<void> {
  try {
    await ElMessageBox.prompt(
      t('storage.destroyConfirm', { name }),
      t('storage.destroyTitle'),
      {
        confirmButtonText: t('storage.destroy'),
        cancelButtonText: t('common.cancel'),
        type: 'error',
        inputPlaceholder: name,
        inputValidator: (v: string) => v === name || t('storage.poolNameMismatch'),
      },
    );
  } catch {
    return;
  }
  const ok = await storage.destroyPool(name);
  if (ok) ElMessage.success(t('storage.poolDestroyed', { name }));
  else ElMessage.error(storage.lastError ?? t('storage.destroyFailed'));
}

/** 启动 Scrub 并开始轮询 */
async function startScrub(name: string): Promise<void> {
  const ok = await storage.startScrub(name);
  if (ok) {
    ElMessage.success(t('storage.scrubStarted', { name }));
    startScrubPolling();
  } else {
    ElMessage.error(storage.lastError ?? t('storage.startFailed'));
  }
}

/** 轮询所有运行中的 Scrub */
function startScrubPolling(): void {
  if (scrubTimer) return;
  scrubTimer = setInterval(async () => {
    const running = storage.pools.filter(
      (p) => storage.scrubStatus[p.name]?.running,
    );
    if (running.length === 0) {
      stopScrubPolling();
      return;
    }
    for (const p of running) {
      await storage.pollScrubStatus(p.name);
    }
  }, 3000);
}

function stopScrubPolling(): void {
  if (scrubTimer) {
    clearInterval(scrubTimer);
    scrubTimer = null;
  }
}

/** 查看 SMART 详情 */
async function showSmart(name: string): Promise<void> {
  smartPool.value = name;
  smartVisible.value = true;
  smartDetails.value = await storage.poolSmart(name);
}

/** 打开扩容对话框 */
function openExpand(name: string): void {
  expandPool.value = name;
  expandDisks.value = [];
  expandVisible.value = true;
}

/** 提交扩容 */
async function submitExpand(): Promise<void> {
  if (expandDisks.value.length === 0) {
    ElMessage.warning(t('storage.selectAtLeastOneDisk'));
    return;
  }
  const ok = await storage.expandPool(expandPool.value, expandDisks.value);
  if (ok) {
    ElMessage.success(t('storage.expandIssued'));
    expandVisible.value = false;
  } else {
    ElMessage.error(storage.lastError ?? t('storage.expandFailed'));
  }
}

onMounted(() => {
  void storage.fetchAll();
});

onUnmounted(() => {
  stopScrubPolling();
});
</script>

<template>
  <div class="sv-view">
    <!-- 物理磁盘 -->
    <div class="nx-panel">
      <div class="sv-section-title">{{ t('storage.physicalDisks') }}</div>
      <div v-if="storage.disks.length === 0 && !storage.loading" class="sv-empty">
        {{ t('storage.noDisks') }}
      </div>
      <div class="sv-disk-row">
        <div
          v-for="disk in storage.disks"
          :key="disk.device"
          class="sv-disk"
          :class="{ 'sv-disk--warn': !disk.smart.healthy }"
        >
          <div class="sv-disk__head">
            <span class="nx-mono sv-disk__device">{{ disk.device }}</span>
            <span
              class="nx-dot"
              :style="{ background: smartColor(disk.smart.healthy) }"
              :title="disk.smart.healthy ? t('storage.smartOk') : t('storage.smartAlert')"
            />
          </div>
          <div class="sv-disk__model" :title="disk.model">{{ disk.model }}</div>
          <div class="sv-disk__meta nx-mono">
            {{ formatBytes(disk.sizeBytes) }}
            <span v-if="disk.smart.temperature !== null"> · {{ disk.smart.temperature }}°C</span>
          </div>
          <div class="sv-disk__pool nx-mono">
            <template v-if="disk.inPool">{{ t('storage.inPool', { pool: disk.inPool }) }}</template>
            <template v-else-if="disk.mountPoint">{{ t('storage.mounted', { mount: disk.mountPoint }) }}</template>
            <template v-else>{{ t('storage.unused') }}</template>
          </div>
        </div>
      </div>
    </div>

    <!-- 存储池列表 -->
    <div class="nx-panel">
      <div class="sv-section-title">{{ t('storage.pools') }}</div>
      <div v-if="storage.pools.length === 0 && !storage.loading" class="sv-empty">
        {{ t('storage.noPools') }}
      </div>
      <div class="sv-pool-list">
        <div v-for="pool in storage.pools" :key="pool.name" class="sv-pool">
          <div class="sv-pool__head">
            <el-icon class="sv-pool__icon"><Coin /></el-icon>
            <span class="sv-pool__name">{{ pool.name }}</span>
            <el-tag :type="poolTagType(pool.state)" size="small">{{ poolStateText(pool.state) }}</el-tag>
            <span class="sv-pool__raid nx-mono">{{ pool.level.toUpperCase() }} · {{ t('storage.diskCount', { count: pool.devices.length }) }}</span>
          </div>

          <div class="sv-pool__usage">
            <el-progress
              :percentage="Math.round(pool.usedPercent)"
              :color="usageLevel(pool.usedPercent) === 'critical' ? 'var(--el-color-danger)' : usageLevel(pool.usedPercent) === 'warn' ? 'var(--el-color-warning)' : 'var(--nx-amber)'"
              :stroke-width="10"
              :show-text="false"
            />
            <div class="sv-pool__usage-text nx-mono">
              {{ formatBytes(pool.usedBytes) }} / {{ formatBytes(pool.totalBytes) }}
              （{{ pool.usedPercent.toFixed(1) }}%）
            </div>
          </div>

          <!-- Scrub 进度 -->
          <div v-if="storage.scrubStatus[pool.name]?.running" class="sv-pool__scrub">
            <el-progress
              :percentage="Math.round(storage.scrubStatus[pool.name]?.progress ?? 0)"
              :stroke-width="6"
              status="success"
            />
            <span class="nx-mono sv-pool__scrub-label">{{ t('storage.scrubbing') }}</span>
          </div>

          <div class="sv-pool__ops">
            <el-button size="small" @click="openExpand(pool.name)">{{ t('storage.expand') }}</el-button>
            <el-button size="small" @click="startScrub(pool.name)">{{ t('storage.scrub') }}</el-button>
            <el-button size="small" @click="showSmart(pool.name)">{{ t('storage.smartDetail') }}</el-button>
            <el-button size="small" type="danger" plain @click="destroyPool(pool.name)">{{ t('storage.destroy') }}</el-button>
          </div>
        </div>
      </div>

      <div class="sv-create">
        <el-button :icon="Plus" type="primary" @click="createVisible = true">{{ t('storage.createPool') }}</el-button>
      </div>
    </div>

    <!-- 创建池对话框 -->
    <el-dialog v-model="createVisible" :title="t('storage.createPool')" width="520px" append-to-body>
      <el-form label-position="top">
        <el-form-item :label="t('storage.poolName')">
          <el-input v-model="createForm.name" :placeholder="t('storage.poolNamePh')" />
        </el-form-item>
        <el-form-item :label="t('storage.raidLevel')">
          <el-select v-model="createForm.level" style="width: 100%">
            <el-option v-for="l in raidLevels" :key="l.value" :label="l.label" :value="l.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('storage.selectDisks')">
          <div v-if="freeDisks.length === 0" class="sv-empty">{{ t('storage.noFreeDisks') }}</div>
          <el-checkbox-group v-model="createForm.disks" class="sv-disk-checks">
            <el-checkbox v-for="d in freeDisks" :key="d.device" :value="d.device">
              <span class="nx-mono">{{ d.device }}</span> · {{ formatBytes(d.sizeBytes) }} · {{ d.model }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" :disabled="!createDiskValid" @click="submitCreate">
          {{ t('common.create') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- SMART 详情对话框 -->
    <el-dialog v-model="smartVisible" :title="`${t('storage.smartDetail')} — ${smartPool}`" width="640px" append-to-body>
      <div v-if="smartDetails.length === 0" class="sv-empty">{{ t('storage.noSmartData') }}</div>
      <div v-for="d in smartDetails" :key="d.device" class="sv-smart">
        <div class="sv-smart__head">
          <span class="nx-mono">{{ d.device }}</span>
          <el-tag :type="d.healthy ? 'success' : 'danger'" size="small">
            {{ d.healthy ? t('common.healthy') : t('common.alert') }}
          </el-tag>
          <span class="nx-mono sv-smart__meta">
            {{ d.temperature ?? '—' }}°C · {{ t('storage.poweredOn') }} {{ d.powerOnHours ?? '—' }} h
          </span>
        </div>
        <table class="sv-smart__table nx-mono">
          <thead>
            <tr>
              <th>{{ t('storage.smartAttrs.attr') }}</th>
              <th>{{ t('storage.smartAttrs.current') }}</th>
              <th>{{ t('storage.smartAttrs.worst') }}</th>
              <th>{{ t('storage.smartAttrs.threshold') }}</th>
              <th>{{ t('storage.smartAttrs.raw') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(attr, key) in d.attributes" :key="key">
              <td>{{ key }}</td>
              <td>{{ attr.value }}</td>
              <td>{{ attr.worst }}</td>
              <td>{{ attr.thresh }}</td>
              <td>{{ attr.raw }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </el-dialog>

    <!-- 扩容对话框 -->
    <el-dialog v-model="expandVisible" :title="`${t('storage.expand')} — ${expandPool}`" width="480px" append-to-body>
      <div v-if="freeDisks.length === 0" class="sv-empty">{{ t('storage.noFreeDisks') }}</div>
      <el-checkbox-group v-else v-model="expandDisks" class="sv-disk-checks">
        <el-checkbox v-for="d in freeDisks" :key="d.device" :value="d.device">
          <span class="nx-mono">{{ d.device }}</span> · {{ formatBytes(d.sizeBytes) }}
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="expandVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="expandDisks.length === 0" @click="submitExpand">{{ t('storage.confirmExpand') }}</el-button>
      </template>
    </el-dialog>

    <!-- Phase 4: RAID 阵列管理 -->
    <div style="margin-top: 24px; border-top: 1px solid var(--nx-border-faint); padding-top: 16px">
      <RaidManager />
    </div>

    <!-- Phase 4: LUKS 卷加密 -->
    <div style="margin-top: 24px; border-top: 1px solid var(--nx-border-faint); padding-top: 16px">
      <LuksManager />
    </div>

    <!-- Phase 4: SSD 缓存 -->
    <div style="margin-top: 24px; border-top: 1px solid var(--nx-border-faint); padding-top: 16px">
      <SsdCacheManager />
    </div>

    <!-- Phase 4: iSCSI Target -->
    <div style="margin-top: 24px; border-top: 1px solid var(--nx-border-faint); padding-top: 16px">
      <IscsiManager />
    </div>
  </div>
</template>

<style scoped>
.sv-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: fade-up 0.3s ease both;
}

.sv-section-title {
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

.sv-empty {
  color: var(--nx-text-faint);
  font-size: 12px;
  padding: 12px 0;
}

.sv-disk-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.sv-disk {
  flex: 0 0 180px;
  border: 1px solid var(--nx-border-faint);
  background: var(--nx-bg-sunken);
  padding: 10px 12px;
  transition: border-color 0.15s;
}

.sv-disk:hover {
  border-color: var(--nx-border-strong);
}

.sv-disk--warn {
  border-color: var(--el-color-danger);
}

.sv-disk__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.sv-disk__device {
  font-size: 12px;
  font-weight: 600;
  color: var(--nx-text);
}

.sv-disk__model {
  font-size: 11px;
  color: var(--nx-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.sv-disk__meta {
  font-size: 11px;
  color: var(--nx-text);
  margin-bottom: 2px;
}

.sv-disk__pool {
  font-size: 10px;
  color: var(--nx-amber);
}

.sv-pool-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sv-pool {
  border: 1px solid var(--nx-border-faint);
  background: var(--nx-bg-sunken);
  padding: 12px 14px;
}

.sv-pool__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.sv-pool__icon {
  color: var(--nx-amber);
  font-size: 16px;
}

.sv-pool__name {
  font-family: var(--nx-font-display);
  font-size: 14px;
  font-weight: 700;
  color: var(--nx-text);
}

.sv-pool__raid {
  margin-left: auto;
  font-size: 11px;
  color: var(--nx-text-faint);
}

.sv-pool__usage {
  margin-bottom: 10px;
}

.sv-pool__usage-text {
  font-size: 11px;
  color: var(--nx-text-faint);
  margin-top: 4px;
}

.sv-pool__scrub {
  margin-bottom: 10px;
}

.sv-pool__scrub-label {
  font-size: 10px;
  color: var(--el-color-success);
}

.sv-pool__ops {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sv-create {
  margin-top: 14px;
}

.sv-disk-checks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sv-smart {
  margin-bottom: 16px;
}

.sv-smart__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--nx-text);
}

.sv-smart__meta {
  margin-left: auto;
  font-size: 10px;
  color: var(--nx-text-faint);
}

.sv-smart__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.sv-smart__table th,
.sv-smart__table td {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid var(--nx-border-faint);
  color: var(--nx-text-faint);
}

.sv-smart__table th {
  color: var(--nx-text);
  font-weight: 600;
}
</style>
