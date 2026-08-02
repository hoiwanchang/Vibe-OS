<script setup lang="ts">
/**
 * 全文搜索窗口（Phase 1）
 * - 搜索栏：关键词 + 文件类型 + 路径前缀过滤
 * - 结果列表：文件名 / 路径 / 匹配摘要 / 大小 / 时间
 * - 索引状态栏 + 手动重建索引
 * - 双击结果在文件预览中打开（emit 给父级，简化为下载）
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { Search, Refresh } from '@element-plus/icons-vue';
import { searchApi } from '@/api';
import type { SearchResultItem, SearchStatus } from '@/api/types';
import { useFilesStore } from '@/stores/files';
import { formatBytes, formatTime } from '@/utils/format';

const { t } = useI18n();
const files = useFilesStore();

const query = ref('');
const typeFilter = ref('');
const pathFilter = ref('');
const results = ref<SearchResultItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);
const searched = ref(false);
const status = ref<SearchStatus | null>(null);
const reindexing = ref(false);

/** 可选文件类型过滤项 */
const typeOptions = ['txt', 'md', 'json', 'yaml', 'csv', 'log', 'js', 'ts', 'py', 'sh'];

/** 执行搜索 */
async function doSearch(resetPage = true): Promise<void> {
  if (resetPage) page.value = 1;
  if (!query.value.trim()) return;
  loading.value = true;
  searched.value = true;
  try {
    const res = await searchApi.search({
      uid: files.uid,
      q: query.value.trim(),
      type: typeFilter.value || undefined,
      path: pathFilter.value || undefined,
      page: page.value,
      size: pageSize,
    });
    results.value = res.results;
    total.value = res.total;
  } catch (err) {
    results.value = [];
    total.value = 0;
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    loading.value = false;
  }
}

/** 翻页 */
function onPageChange(p: number): void {
  page.value = p;
  void doSearch(false);
}

/** 拉取索引状态 */
async function loadStatus(): Promise<void> {
  try {
    status.value = await searchApi.status(files.uid);
  } catch {
    status.value = null;
  }
}

/** 重建索引 */
async function reindex(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('search.reindexConfirm'), t('search.reindex'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    });
  } catch {
    return;
  }
  reindexing.value = true;
  try {
    const res = await searchApi.reindex(files.uid);
    ElMessage.success(t('search.reindexed', { count: res.indexed, ms: res.durationMs }));
    await loadStatus();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    reindexing.value = false;
  }
}

/** 双击结果 → 触发浏览器下载该文件 */
function openResult(item: SearchResultItem): void {
  files.download(item.path);
}

onMounted(() => {
  void loadStatus();
});
</script>

<template>
  <div class="sv">
    <!-- 搜索栏 -->
    <div class="sv__bar nx-panel">
      <el-input
        v-model="query"
        :placeholder="t('search.placeholder')"
        class="sv__input"
        :prefix-icon="Search"
        clearable
        @keyup.enter="doSearch()"
      />
      <el-select v-model="typeFilter" :placeholder="t('search.filterType')" clearable class="sv__type">
        <el-option :label="t('search.allTypes')" value="" />
        <el-option v-for="tp in typeOptions" :key="tp" :label="tp" :value="tp" />
      </el-select>
      <el-input
        v-model="pathFilter"
        :placeholder="t('search.filterPath')"
        class="sv__path"
        clearable
      />
      <el-button type="primary" :icon="Search" :loading="loading" @click="doSearch()">
        {{ t('search.searchBtn') }}
      </el-button>
    </div>

    <!-- 结果列表 -->
    <div v-loading="loading" class="sv__results nx-panel">
      <table class="sv__table">
        <thead>
          <tr>
            <th class="sv__th sv__th--file">{{ t('search.colFile') }}</th>
            <th class="sv__th sv__th--snippet">{{ t('search.colSnippet') }}</th>
            <th class="sv__th sv__th--size">{{ t('files.colSize') }}</th>
            <th class="sv__th sv__th--time">{{ t('files.colModified') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="searched && results.length === 0 && !loading">
            <td colspan="4" class="sv__empty">{{ t('search.noResults') }}</td>
          </tr>
          <tr
            v-for="item in results"
            :key="item.path"
            class="sv__row"
            @dblclick="openResult(item)"
          >
            <td class="sv__td sv__td--file">
              <div class="sv__fname" :title="item.filename">{{ item.filename }}</div>
              <div class="sv__fpath nx-mono" :title="item.path">{{ item.path }}</div>
            </td>
            <td class="sv__td sv__td--snippet nx-mono" v-html="item.snippet" />
            <td class="sv__td sv__td--size nx-mono">{{ formatBytes(item.size) }}</td>
            <td class="sv__td sv__td--time nx-mono">{{ formatTime(item.mtime) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 状态栏 -->
    <div class="sv__statusbar nx-mono">
      <span v-if="searched">{{ t('search.resultCount', { total }) }}</span>
      <span v-if="status">
        {{ t('search.status', { count: status.indexedFiles, size: formatBytes(status.totalBytes) }) }}
        <template v-if="status.lastIndexed">
          · {{ t('search.lastIndexed', { time: formatTime(status.lastIndexed) }) }}
        </template>
      </span>
      <span class="sv__statusbar__spacer" />
      <el-button size="small" :icon="Refresh" :loading="reindexing" @click="reindex">
        {{ t('search.reindex') }}
      </el-button>
    </div>

    <!-- 分页 -->
    <div v-if="total > pageSize" class="sv__pager">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        small
        @current-change="onPageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.sv {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  padding: 12px;
  box-sizing: border-box;
}
.sv__bar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px;
}
.sv__input {
  flex: 1;
  min-width: 160px;
}
.sv__type {
  width: 120px;
}
.sv__path {
  width: 160px;
}
.sv__results {
  flex: 1;
  overflow: auto;
  padding: 0;
}
.sv__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.sv__th {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nx-border, #2a2a2a);
  color: var(--nx-text-dim, #888);
  font-weight: 600;
  position: sticky;
  top: 0;
  background: var(--nx-bg, #0d0d0d);
}
.sv__th--size,
.sv__th--time {
  width: 110px;
}
.sv__row {
  cursor: pointer;
}
.sv__row:hover {
  background: var(--nx-bg-elevated, #161616);
}
.sv__td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--nx-border-soft, #1e1e1e);
  vertical-align: top;
}
.sv__fname {
  color: var(--nx-text, #e0e0e0);
  font-weight: 500;
}
.sv__fpath {
  font-size: 11px;
  color: var(--nx-text-dim, #777);
  margin-top: 2px;
  word-break: break-all;
}
.sv__td--snippet {
  font-size: 12px;
  color: var(--nx-text-dim, #aaa);
  line-height: 1.5;
  max-width: 360px;
}
/* Phase 1: 搜索关键词高亮 */
.sv__td--snippet :deep(mark) {
  background: var(--nx-accent, #f5a623);
  color: #000;
  padding: 0 2px;
  font-weight: 700;
}
.sv__td--size,
.sv__td--time {
  color: var(--nx-text-dim, #999);
  white-space: nowrap;
}
.sv__empty {
  padding: 40px 0;
  text-align: center;
  color: var(--nx-text-dim, #666);
}
.sv__statusbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--nx-text-dim, #888);
  border-top: 1px solid var(--nx-border, #2a2a2a);
}
.sv__statusbar__spacer {
  flex: 1;
}
.sv__pager {
  display: flex;
  justify-content: center;
}
</style>
