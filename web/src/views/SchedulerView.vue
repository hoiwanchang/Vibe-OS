<script setup lang="ts">
/**
 * 计划任务窗口（P2）
 * - 任务表格：名称 / 命令 / 计划 / 状态 / 上次执行 / 操作
 * - 新建/编辑：名称 / 命令 textarea / cron + 人类可读预览 + 下次 5 次执行时间
 * - 启用/禁用：el-switch 行内切换
 * - 立即执行：按钮 → running → 完成后刷新
 * - 历史：el-drawer timeline，stdout/stderr 用 pre 等宽显示
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, VideoPlay } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { useSchedulerStore } from '@/stores/scheduler';
import type { CreateScheduledJobRequest, ScheduledJob } from '@/api/types';
import { formatTime } from '@/utils/format';

const { t } = useI18n();

const scheduler = useSchedulerStore();

/** 编辑对话框 */
const dialogVisible = ref(false);
const editingId = ref<string | null>(null);
const submitting = ref(false);
const form = reactive<CreateScheduledJobRequest>({
  name: '',
  command: '',
  schedule: '',
  enabled: true,
});

/** 历史抽屉 */
const historyVisible = ref(false);
const historyJob = ref<ScheduledJob | null>(null);

/** cron 人类可读预览 */
const cronPreview = computed(() => describeCron(form.schedule));

/** 下次 5 次执行时间（简易估算） */
const nextRuns = computed(() => computeNextRuns(form.schedule, 5));

/** 简易 cron 表达式人类可读描述 */
function describeCron(expr: string): string {
  if (!expr.trim()) return t('scheduler.cron.empty');
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return t('scheduler.cron.badFormat');
  const [min, hour, dom, , dow] = parts as [string, string, string, string, string];
  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  if (dom === '*' && dow === '*') return t('scheduler.cron.daily', { time });
  if (dom === '*' && dow === '0') return t('scheduler.cron.sunday', { time });
  if (dom === '*' && dow === '1') return t('scheduler.cron.monday', { time });
  if (dom === '*' && dow === '6') return t('scheduler.cron.saturday', { time });
  if (dom === '1' && dow === '*') return t('scheduler.cron.monthly', { time });
  if (min === '0' && hour === '*') return t('scheduler.cron.hourly');
  if (min === '*/30') return t('scheduler.cron.every30');
  return t('scheduler.cron.custom', { expr });
}

/** 估算下次 N 次执行时间（仅支持"每天 HH:MM"类简单表达式） */
function computeNextRuns(expr: string, count: number): Date[] {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return [];
  const [min, hour, dom, , dow] = parts as [string, string, string, string, string];
  const m = Number(min);
  const h = Number(hour);
  if (Number.isNaN(m) || Number.isNaN(h)) return [];
  if (dom !== '*' || !['*', '0', '1', '6'].includes(dow)) return [];

  const runs: Date[] = [];
  const cursor = new Date();
  cursor.setSeconds(0, 0);
  cursor.setHours(h, m, 0, 0);
  if (cursor.getTime() <= Date.now()) cursor.setDate(cursor.getDate() + 1);

  const targetDow = dow === '*' ? null : Number(dow);
  let guard = 0;
  while (runs.length < count && guard < 400) {
    guard += 1;
    const matchesDow = targetDow === null || cursor.getDay() === targetDow;
    const matchesDom = dom === '*' || cursor.getDate() === Number(dom);
    if (matchesDow && matchesDom) runs.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return runs;
}

/** 状态标签 */
function statusTag(status: string | null): 'success' | 'danger' | 'warning' | 'info' {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'running') return 'warning';
  return 'info';
}

function statusText(status: string | null): string {
  const map: Record<string, string> = {
    success: t('scheduler.statusMap.success'),
    failed: t('scheduler.statusMap.failed'),
    running: t('scheduler.statusMap.running'),
  };
  return status ? (map[status] ?? status) : t('scheduler.neverRun');
}

/** 执行历史节点类型 */
function execType(status: string): 'success' | 'danger' | 'primary' {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  return 'primary';
}

/** 打开新建对话框 */
function openCreate(): void {
  editingId.value = null;
  Object.assign(form, { name: '', command: '', schedule: '0 3 * * *', enabled: true });
  dialogVisible.value = true;
}

/** 打开编辑对话框 */
function openEdit(job: ScheduledJob): void {
  editingId.value = job.id;
  Object.assign(form, {
    name: job.name,
    command: job.command,
    schedule: job.schedule,
    enabled: job.enabled,
  });
  dialogVisible.value = true;
}

/** 提交表单 */
async function submit(): Promise<void> {
  if (!form.name.trim() || !form.command.trim() || !form.schedule.trim()) {
    ElMessage.warning(t('scheduler.fillRequired'));
    return;
  }
  const payload: CreateScheduledJobRequest = {
    name: form.name.trim(),
    command: form.command.trim(),
    schedule: form.schedule.trim(),
    enabled: form.enabled,
  };
  submitting.value = true;
  const ok = editingId.value
    ? await scheduler.updateJob(editingId.value, payload)
    : await scheduler.createJob(payload);
  submitting.value = false;
  if (ok) {
    ElMessage.success(editingId.value ? t('scheduler.taskUpdated') : t('scheduler.taskCreated'));
    dialogVisible.value = false;
  } else {
    ElMessage.error(scheduler.lastError ?? t('scheduler.opFailed'));
  }
}

/** 启用/禁用切换 */
async function toggleEnabled(job: ScheduledJob): Promise<void> {
  const ok = await scheduler.updateJob(job.id, { enabled: !job.enabled });
  if (!ok) ElMessage.error(scheduler.lastError ?? t('scheduler.toggleFailed'));
}

/** 立即执行 */
async function runJob(job: ScheduledJob): Promise<void> {
  const ok = await scheduler.runJob(job.id);
  if (ok) ElMessage.success(t('scheduler.jobStarted', { name: job.name }));
  else ElMessage.error(scheduler.lastError ?? t('scheduler.startFailed'));
}

/** 删除任务 */
async function deleteJob(job: ScheduledJob): Promise<void> {
  try {
    await ElMessageBox.confirm(t('scheduler.deleteConfirm', { name: job.name }), t('scheduler.deleteTitle'), {
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    });
  } catch {
    return;
  }
  const ok = await scheduler.deleteJob(job.id);
  if (ok) ElMessage.success(t('scheduler.taskDeleted'));
  else ElMessage.error(scheduler.lastError ?? t('scheduler.deleteFailed'));
}

/** 打开历史抽屉 */
async function showHistory(job: ScheduledJob): Promise<void> {
  historyJob.value = job;
  historyVisible.value = true;
  await scheduler.fetchHistory(job.id);
}

/** 格式化下次执行时间 */
function nextRunText(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

onMounted(() => {
  void scheduler.fetchJobs();
});
</script>

<template>
  <div class="sc-view">
    <div class="nx-panel">
      <div class="sc-section-title">{{ t('scheduler.title') }}</div>

      <el-table v-loading="scheduler.loading" :data="scheduler.jobs" size="small" stripe>
        <el-table-column prop="name" :label="t('common.name')" min-width="120">
          <template #default="{ row }">
            <span class="sc-name">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="command" :label="t('scheduler.colCommand')" min-width="220">
          <template #default="{ row }">
            <span class="nx-mono sc-cmd" :title="row.command">{{ row.command }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('scheduler.colSchedule')" width="110">
          <template #default="{ row }">
            <span class="nx-mono">{{ row.schedule }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('scheduler.colEnabled')" width="80">
          <template #default="{ row }">
            <el-switch size="small" :model-value="row.enabled" @change="toggleEnabled(row)" />
          </template>
        </el-table-column>
        <el-table-column :label="t('scheduler.colLastRun')" width="140">
          <template #default="{ row }">
            <el-tag v-if="row.lastStatus" :type="statusTag(row.lastStatus)" size="small">
              {{ statusText(row.lastStatus) }}
            </el-tag>
            <span v-else class="sc-never">{{ t('scheduler.neverRun') }}</span>
            <div class="nx-mono sc-last-time">{{ formatTime(row.lastRun) }}</div>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.ops')" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text :icon="VideoPlay" @click="runJob(row)">{{ t('common.execute') }}</el-button>
            <el-button size="small" text @click="showHistory(row)">{{ t('common.history') }}</el-button>
            <el-button size="small" text @click="openEdit(row)">{{ t('common.edit') }}</el-button>
            <el-button size="small" text type="danger" @click="deleteJob(row)">{{ t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="sc-create">
        <el-button :icon="Plus" type="primary" @click="openCreate">{{ t('scheduler.newTask') }}</el-button>
      </div>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? t('scheduler.editTask') : t('scheduler.createTask')"
      width="560px"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item :label="t('scheduler.taskName')">
          <el-input v-model="form.name" :placeholder="t('scheduler.taskNamePh')" />
        </el-form-item>
        <el-form-item :label="t('scheduler.colCommand')">
          <el-input
            v-model="form.command"
            type="textarea"
            :rows="3"
            placeholder="/data/vibeos/scripts/clean-logs.sh"
            class="nx-mono"
          />
        </el-form-item>
        <el-form-item :label="t('scheduler.cronExpr')">
          <el-input v-model="form.schedule" placeholder="0 3 * * *" class="nx-mono" />
          <div class="sc-cron-preview">{{ cronPreview }}</div>
          <div v-if="nextRuns.length > 0" class="sc-next-runs">
            <span class="sc-next-runs__label">{{ t('scheduler.nextRuns') }}</span>
            <span v-for="(d, i) in nextRuns" :key="i" class="nx-mono sc-next-runs__item">
              {{ nextRunText(d) }}
            </span>
          </div>
        </el-form-item>
        <el-form-item :label="t('scheduler.colEnabled')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">
          {{ editingId ? t('common.save') : t('common.create') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 执行历史抽屉 -->
    <el-drawer
      v-model="historyVisible"
      :title="t('scheduler.execHistory', { name: historyJob?.name ?? '' })"
      size="480px"
      append-to-body
    >
      <div v-if="(scheduler.executions[historyJob?.id ?? ''] ?? []).length === 0" class="sc-empty">
        {{ t('scheduler.noExec') }}
      </div>
      <el-timeline v-else>
        <el-timeline-item
          v-for="exec in scheduler.executions[historyJob?.id ?? ''] ?? []"
          :key="exec.id"
          :type="execType(exec.status)"
          :timestamp="formatTime(exec.startedAt)"
          placement="top"
        >
          <div class="sc-exec">
            <span class="sc-exec__status">{{ statusText(exec.status) }}</span>
            <span class="nx-mono sc-exec__code">{{ t('common.exitCode') }} {{ exec.exitCode ?? '—' }}</span>
          </div>
          <div v-if="exec.stdout" class="sc-exec__block">
            <div class="sc-exec__block-label">stdout</div>
            <pre class="nx-mono sc-exec__pre">{{ exec.stdout }}</pre>
          </div>
          <div v-if="exec.stderr" class="sc-exec__block sc-exec__block--err">
            <div class="sc-exec__block-label">stderr</div>
            <pre class="nx-mono sc-exec__pre">{{ exec.stderr }}</pre>
          </div>
        </el-timeline-item>
      </el-timeline>
    </el-drawer>
  </div>
</template>

<style scoped>
.sc-view {
  animation: fade-up 0.3s ease both;
}

.sc-section-title {
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

.sc-name {
  font-weight: 600;
  color: var(--nx-text);
}

.sc-cmd {
  font-size: 11px;
  color: var(--nx-text-faint);
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.sc-never {
  font-size: 11px;
  color: var(--nx-text-faint);
}

.sc-last-time {
  font-size: 10px;
  color: var(--nx-text-faint);
  margin-top: 2px;
}

.sc-create {
  margin-top: 14px;
}

.sc-cron-preview {
  font-size: 11px;
  color: var(--nx-amber);
  margin-top: 4px;
}

.sc-next-runs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 6px;
}

.sc-next-runs__label {
  font-size: 10px;
  color: var(--nx-text-faint);
}

.sc-next-runs__item {
  font-size: 10px;
  color: var(--nx-text-faint);
  border: 1px solid var(--nx-border-faint);
  padding: 1px 5px;
}

.sc-empty {
  color: var(--nx-text-faint);
  font-size: 12px;
  text-align: center;
  padding: 24px 0;
}

.sc-exec {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.sc-exec__status {
  font-weight: 600;
  font-size: 13px;
  color: var(--nx-text);
}

.sc-exec__code {
  font-size: 11px;
  color: var(--nx-text-faint);
}

.sc-exec__block {
  margin-top: 6px;
}

.sc-exec__block-label {
  font-family: var(--nx-font-display);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--nx-text-faint);
  margin-bottom: 3px;
}

.sc-exec__pre {
  background: var(--nx-bg-sunken);
  border: 1px solid var(--nx-border-faint);
  padding: 8px 10px;
  font-size: 11px;
  color: var(--nx-text);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
  margin: 0;
}

.sc-exec__block--err .sc-exec__pre {
  color: var(--el-color-danger);
}
</style>
