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
import { useStorageStore } from '@/stores/storage';
import type { CreatePoolRequest, DiskSmartDetail } from '@/api/types';
import { formatBytes, usageLevel } from '@/utils/format';

const storage = useStorageStore();

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
  { value: 'raid0', label: 'RAID 0（条带，≥2 盘）', min: 2 },
  { value: 'raid1', label: 'RAID 1（镜像，≥2 盘）', min: 2 },
  { value: 'raid5', label: 'RAID 5（奇偶校验，≥3 盘）', min: 3 },
  { value: 'raid6', label: 'RAID 6（双重校验，≥4 盘）', min: 4 },
  { value: 'raid10', label: 'RAID 10（镜像+条带，≥4 盘）', min: 4 },
  { value: 'jbod', label: 'JBOD（线性合并，≥1 盘）', min: 1 },
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
    active: '正常',
    degraded: '降级',
    rebuilding: '重建中',
    inactive: '未激活',
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
    ElMessage.warning('请输入存储池名称');
    return;
  }
  if (!createDiskValid.value) {
    ElMessage.warning('所选磁盘数量不满足该 RAID 级别要求');
    return;
  }
  creating.value = true;
  const ok = await storage.createPool({ ...createForm.value });
  creating.value = false;
  if (ok) {
    ElMessage.success(`存储池 ${createForm.value.name} 创建成功`);
    createVisible.value = false;
    createForm.value = { name: '', level: 'raid1', disks: [] };
  } else {
    ElMessage.error(storage.lastError ?? '创建失败');
  }
}

/** 销毁池（输入池名二次确认） */
async function destroyPool(name: string): Promise<void> {
  try {
    await ElMessageBox.prompt(
      `此操作将永久销毁存储池「${name}」及其全部数据，且不可恢复。请输入池名确认：`,
      '销毁存储池',
      {
        confirmButtonText: '销毁',
        cancelButtonText: '取消',
        type: 'error',
        inputPlaceholder: name,
        inputValidator: (v: string) => v === name || '池名不匹配',
      },
    );
  } catch {
    return;
  }
  const ok = await storage.destroyPool(name);
  if (ok) ElMessage.success(`存储池 ${name} 已销毁`);
  else ElMessage.error(storage.lastError ?? '销毁失败');
}

/** 启动 Scrub 并开始轮询 */
async function startScrub(name: string): Promise<void> {
  const ok = await storage.startScrub(name);
  if (ok) {
    ElMessage.success(`已启动 ${name} 的 Scrub 校验`);
    startScrubPolling();
  } else {
    ElMessage.error(storage.lastError ?? '启动失败');
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
    ElMessage.warning('请至少选择一块磁盘');
    return;
  }
  const ok = await storage.expandPool(expandPool.value, expandDisks.value);
  if (ok) {
    ElMessage.success('扩容指令已下发');
    expandVisible.value = false;
  } else {
    ElMessage.error(storage.lastError ?? '扩容失败');
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
      <div class="sv-section-title">物理磁盘</div>
      <div v-if="storage.disks.length === 0 && !storage.loading" class="sv-empty">
        未检测到磁盘
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
              :title="disk.smart.healthy ? 'SMART 正常' : 'SMART 告警'"
            />
          </div>
          <div class="sv-disk__model" :title="disk.model">{{ disk.model }}</div>
          <div class="sv-disk__meta nx-mono">
            {{ formatBytes(disk.sizeBytes) }}
            <span v-if="disk.smart.temperature !== null"> · {{ disk.smart.temperature }}°C</span>
          </div>
          <div class="sv-disk__pool nx-mono">
            <template v-if="disk.inPool">池: {{ disk.inPool }}</template>
            <template v-else-if="disk.mountPoint">挂载: {{ disk.mountPoint }}</template>
            <template v-else>未使用</template>
          </div>
        </div>
      </div>
    </div>

    <!-- 存储池列表 -->
    <div class="nx-panel">
      <div class="sv-section-title">存储池</div>
      <div v-if="storage.pools.length === 0 && !storage.loading" class="sv-empty">
        暂无存储池，点击下方按钮创建
      </div>
      <div class="sv-pool-list">
        <div v-for="pool in storage.pools" :key="pool.name" class="sv-pool">
          <div class="sv-pool__head">
            <el-icon class="sv-pool__icon"><Coin /></el-icon>
            <span class="sv-pool__name">{{ pool.name }}</span>
            <el-tag :type="poolTagType(pool.state)" size="small">{{ poolStateText(pool.state) }}</el-tag>
            <span class="sv-pool__raid nx-mono">{{ pool.level.toUpperCase() }} · {{ pool.devices.length }} 盘</span>
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
            <span class="nx-mono sv-pool__scrub-label">Scrub 校验中…</span>
          </div>

          <div class="sv-pool__ops">
            <el-button size="small" @click="openExpand(pool.name)">扩容</el-button>
            <el-button size="small" @click="startScrub(pool.name)">校验</el-button>
            <el-button size="small" @click="showSmart(pool.name)">SMART 详情</el-button>
            <el-button size="small" type="danger" plain @click="destroyPool(pool.name)">销毁</el-button>
          </div>
        </div>
      </div>

      <div class="sv-create">
        <el-button :icon="Plus" type="primary" @click="createVisible = true">创建存储池</el-button>
      </div>
    </div>

    <!-- 创建池对话框 -->
    <el-dialog v-model="createVisible" title="创建存储池" width="520px" append-to-body>
      <el-form label-position="top">
        <el-form-item label="池名称">
          <el-input v-model="createForm.name" placeholder="如 data-pool" />
        </el-form-item>
        <el-form-item label="RAID 级别">
          <el-select v-model="createForm.level" style="width: 100%">
            <el-option v-for="l in raidLevels" :key="l.value" :label="l.label" :value="l.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="选择磁盘（未使用）">
          <div v-if="freeDisks.length === 0" class="sv-empty">无可用磁盘</div>
          <el-checkbox-group v-model="createForm.disks" class="sv-disk-checks">
            <el-checkbox v-for="d in freeDisks" :key="d.device" :value="d.device">
              <span class="nx-mono">{{ d.device }}</span> · {{ formatBytes(d.sizeBytes) }} · {{ d.model }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!createDiskValid" @click="submitCreate">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- SMART 详情对话框 -->
    <el-dialog v-model="smartVisible" :title="`SMART 详情 — ${smartPool}`" width="640px" append-to-body>
      <div v-if="smartDetails.length === 0" class="sv-empty">无 SMART 数据</div>
      <div v-for="d in smartDetails" :key="d.device" class="sv-smart">
        <div class="sv-smart__head">
          <span class="nx-mono">{{ d.device }}</span>
          <el-tag :type="d.healthy ? 'success' : 'danger'" size="small">
            {{ d.healthy ? '健康' : '告警' }}
          </el-tag>
          <span class="nx-mono sv-smart__meta">
            {{ d.temperature ?? '—' }}°C · 通电 {{ d.powerOnHours ?? '—' }} h
          </span>
        </div>
        <table class="sv-smart__table nx-mono">
          <thead>
            <tr><th>属性</th><th>当前值</th><th>最差</th><th>阈值</th><th>原始值</th></tr>
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
    <el-dialog v-model="expandVisible" :title="`扩容 — ${expandPool}`" width="480px" append-to-body>
      <div v-if="freeDisks.length === 0" class="sv-empty">无可用磁盘</div>
      <el-checkbox-group v-else v-model="expandDisks" class="sv-disk-checks">
        <el-checkbox v-for="d in freeDisks" :key="d.device" :value="d.device">
          <span class="nx-mono">{{ d.device }}</span> · {{ formatBytes(d.sizeBytes) }}
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="expandVisible = false">取消</el-button>
        <el-button type="primary" :disabled="expandDisks.length === 0" @click="submitExpand">确认扩容</el-button>
      </template>
    </el-dialog>
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
