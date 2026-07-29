<script setup lang="ts">
/**
 * 日志查看器：多源、级别过滤、导出、清空
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { settingsApi } from '@/api';

const store = useSettingsStore();
const { logs, logSources, logTotal } = storeToRefs(store);

const source = ref('system');
const level = ref('');
const lines = ref(200);
const loading = ref(false);

onMounted(async () => {
  await store.fetchLogSources();
  await fetchLogs();
});

async function fetchLogs(): Promise<void> {
  loading.value = true;
  try {
    await store.fetchLogs(source.value, lines.value, level.value || undefined);
  } finally {
    loading.value = false;
  }
}

async function clearLogs(): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定清空 ${source.value} 日志？`, '确认', { type: 'warning' });
    await settingsApi.clearLogs(source.value);
    ElMessage.success('日志已清空');
    await fetchLogs();
  } catch { /* 取消 */ }
}

async function exportDiag(): Promise<void> {
  try {
    const res = await settingsApi.exportDiagnostics();
    ElMessage.success(`诊断包已生成：${res.path}（${(res.sizeBytes / 1024).toFixed(1)} KB）`);
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

function levelClass(lv: string): string {
  switch (lv) {
    case 'error': return 'log-line--error';
    case 'warn': return 'log-line--warn';
    default: return '';
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">日志查看器</div>
    <div class="log-toolbar">
      <el-select v-model="source" size="small" style="width: 140px" @change="fetchLogs()">
        <el-option v-for="s in logSources" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-select v-model="level" size="small" style="width: 100px" clearable placeholder="全部级别" @change="fetchLogs()">
        <el-option label="Info" value="info" />
        <el-option label="Warn" value="warn" />
        <el-option label="Error" value="error" />
      </el-select>
      <el-input-number v-model="lines" size="small" :min="50" :max="1000" :step="50" style="width: 110px" @change="fetchLogs()" />
      <el-button size="small" @click="fetchLogs()">刷新</el-button>
      <el-button size="small" @click="exportDiag()">导出诊断包</el-button>
      <el-button size="small" type="danger" text @click="clearLogs()">清空日志</el-button>
    </div>

    <div v-loading="loading" class="log-container nx-mono">
      <div
        v-for="(line, i) in logs"
        :key="i"
        class="log-line"
        :class="levelClass(line.level)"
      >
        <span class="log-ts">{{ line.timestamp.replace('T', ' ').replace('Z', '') }}</span>
        <span class="log-lv">[{{ line.level.toUpperCase() }}]</span>
        <span class="log-msg">{{ line.message }}</span>
      </div>
      <div v-if="logs.length === 0 && !loading" class="nx-text-dim" style="padding: 20px; text-align: center">
        暂无日志
      </div>
    </div>
    <div class="log-footer nx-text-dim">共 {{ logTotal }} 条 · 显示最近 {{ logs.length }} 条</div>
  </div>
</template>

<style scoped>
.log-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.log-container {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--nx-border-faint);
  padding: 8px;
  font-size: 12px;
  line-height: 1.7;
  background: var(--nx-bg-sunken);
}
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-line--warn { color: var(--nx-amber); }
.log-line--error { color: var(--nx-red); }
.log-ts { color: var(--nx-text-faint); margin-right: 8px; }
.log-lv { margin-right: 8px; }
.log-footer {
  margin-top: 8px;
  font-size: 11px;
  font-family: var(--nx-font-body);
}
</style>
