<script setup lang="ts">
/**
 * 审计日志查看器（Phase 3）
 * 嵌入设置中心 > 日志分区
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { auditApi } from '@/api';
import type { AuditLogEntry, AuditStats } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const logs = ref<AuditLogEntry[]>([]);
const stats = ref<AuditStats | null>(null);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const filterUser = ref('');
const filterFrom = ref('');
const filterTo = ref('');

onMounted(async () => {
  await Promise.all([loadLogs(), loadStats()]);
});

async function loadLogs(): Promise<void> {
  loading.value = true;
  try {
    const res = await auditApi.getLogs({
      user: filterUser.value || undefined,
      from: filterFrom.value || undefined,
      to: filterTo.value || undefined,
      page: page.value,
      size: size.value,
    });
    logs.value = res.logs;
    total.value = res.total;
  } catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
}

async function loadStats(): Promise<void> {
  try {
    stats.value = await auditApi.getStats();
  } catch { /* ignore */ }
}

function search(): void {
  page.value = 1;
  void loadLogs();
}

async function exportCsv(): Promise<void> {
  try {
    const blob = await auditApi.export('csv');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success(t('settings.audit.exported'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return 'var(--nx-green)';
  if (code >= 400) return 'var(--nx-red)';
  return 'var(--nx-text-dim)';
}
</script>

<template>
  <div class="audit-settings">
    <div class="audit-header">
      <div class="nx-panel-title">{{ t('settings.audit.title') }}</div>
      <el-button size="small" @click="exportCsv">{{ t('settings.audit.export') }}</el-button>
    </div>

    <!-- 统计卡片 -->
    <div v-if="stats" class="audit-stats">
      <div class="audit-stat-card">
        <div class="audit-stat-value nx-mono">{{ stats.todayTotal }}</div>
        <div class="audit-stat-label">{{ t('settings.audit.todayTotal') }}</div>
      </div>
      <div class="audit-stat-card">
        <div class="audit-stat-value nx-mono">{{ stats.todayLogins }}</div>
        <div class="audit-stat-label">{{ t('settings.audit.todayLogins') }}</div>
      </div>
      <div class="audit-stat-card">
        <div class="audit-stat-value nx-mono" style="color: var(--nx-amber)">{{ stats.todaySensitive }}</div>
        <div class="audit-stat-label">{{ t('settings.audit.todaySensitive') }}</div>
      </div>
      <div class="audit-stat-card">
        <div class="audit-stat-value nx-mono">{{ stats.totalEntries }}</div>
        <div class="audit-stat-label">{{ t('settings.audit.totalEntries') }}</div>
      </div>
    </div>

    <!-- 过滤器 -->
    <div class="audit-filters">
      <el-input v-model="filterUser" :placeholder="t('settings.audit.filterUser')" clearable class="audit-filter-input" @keyup.enter="search" />
      <el-date-picker v-model="filterFrom" type="date" :placeholder="t('settings.audit.from')" value-format="YYYY-MM-DD" class="audit-filter-date" />
      <el-date-picker v-model="filterTo" type="date" :placeholder="t('settings.audit.to')" value-format="YYYY-MM-DD" class="audit-filter-date" />
      <el-button size="small" type="primary" @click="search">{{ t('common.search') }}</el-button>
    </div>

    <!-- 日志表格 -->
    <el-table :data="logs" v-loading="loading" size="small" stripe max-height="400">
      <el-table-column prop="timestamp" :label="t('common.time')" width="160">
        <template #default="{ row }"><span class="nx-mono">{{ row.timestamp }}</span></template>
      </el-table-column>
      <el-table-column prop="username" :label="t('settings.audit.colUser')" width="100" />
      <el-table-column :label="t('settings.audit.colAction')" min-width="200">
        <template #default="{ row }">
          <span class="nx-mono">{{ row.method }}</span>
          <span class="audit-path">{{ row.path }}</span>
          <span v-if="row.sensitive" class="audit-sensitive">{{ t('settings.audit.sensitive') }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="ip" label="IP" width="130" />
      <el-table-column :label="t('common.result')" width="70" align="center">
        <template #default="{ row }">
          <span class="nx-mono" :style="{ color: statusColor(row.statusCode) }">{{ row.statusCode }}</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="audit-pagination">
      <el-pagination
        v-model:current-page="page"
        :page-size="size"
        :total="total"
        layout="prev, pager, next"
        small
        @current-change="loadLogs"
      />
    </div>
  </div>
</template>

<style scoped>
.audit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.audit-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.audit-stat-card { padding: 12px; border: 1px solid var(--nx-border-faint); text-align: center; }
.audit-stat-value { font-size: 24px; font-weight: 700; }
.audit-stat-label { font-size: 11px; color: var(--nx-text-dim); margin-top: 4px; }
.audit-filters { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; }
.audit-filter-input { width: 140px; }
.audit-filter-date { width: 150px; }
.audit-path { margin-left: 6px; color: var(--nx-text-dim); }
.audit-sensitive { margin-left: 6px; color: var(--nx-amber); font-size: 10px; border: 1px solid var(--nx-amber); padding: 0 4px; }
.audit-pagination { margin-top: 12px; display: flex; justify-content: flex-end; }
</style>
