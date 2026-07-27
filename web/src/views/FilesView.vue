<script setup lang="ts">
/**
 * 文件管理器窗口（P0）
 * - 工具栏：返回上级 / 面包屑导航 / 刷新 / 新建文件夹 / 上传
 * - 表格列表：图标 / 名称 / 大小 / 修改时间 / 操作，点击表头排序
 * - 双击文件夹进入，双击文本文件打开编辑器（el-drawer + textarea）
 * - 右键菜单：下载 / 重命名 / 复制 / 删除（到回收站）
 * - 拖拽上传（el-upload drag 模式）
 * - 回收站：状态栏点击打开 el-drawer，恢复 / 永久删除 / 清空
 * - 状态栏：项目数 / 已用空间 / 回收站数量
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowLeft,
  Delete,
  Document,
  Download,
  Edit,
  FolderOpened,
  Plus,
  Refresh,
  Upload,
} from '@element-plus/icons-vue';
import type { UploadRequestOptions } from 'element-plus';
import { userApi } from '@/api';
import type { FileEntry, UserQuotaInfo } from '@/api/types';
import { useFilesStore } from '@/stores/files';
import type { FileSortKey } from '@/stores/files';
import { formatBytes, formatTime } from '@/utils/format';

const files = useFilesStore();

/** 文本编辑器抽屉 */
const editorVisible = ref(false);
const editorPath = ref('');
const editorContent = ref('');
const editorSaving = ref(false);
const editorLoading = ref(false);

/** 回收站抽屉 */
const trashVisible = ref(false);

/** 上传面板可见性 */
const uploadVisible = ref(false);

/** 右键菜单状态 */
const ctxMenu = ref({ visible: false, x: 0, y: 0, entry: null as FileEntry | null });

/** 新建文件夹对话框 */
const mkdirVisible = ref(false);
const mkdirName = ref('');

/** 重命名对话框 */
const renameVisible = ref(false);
const renameEntry = ref<FileEntry | null>(null);
const renameNewName = ref('');

/** 是否为文本文件（可编辑） */
function isTextFile(entry: FileEntry): boolean {
  const textTypes = ['text/', 'application/json', 'application/xml', 'application/sql', 'application/x-yaml'];
  const textExts = ['.md', '.txt', '.yaml', '.yml', '.json', '.ts', '.js', '.sh', '.tex', '.csv', '.m3u', '.conf', '.ini', '.log', '.toml'];
  const mime = entry.mimeType ?? '';
  const ext = entry.name.includes('.') ? `.${entry.name.split('.').pop()}` : '';
  return textTypes.some((t) => mime.startsWith(t)) || textExts.includes(ext.toLowerCase());
}

/** 文件图标 */
function fileIcon(entry: FileEntry): string {
  if (entry.type === 'directory') return 'dir';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'img';
  if (['mp3', 'wav', 'flac', 'm4a'].includes(ext)) return 'audio';
  if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return 'video';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['zip', 'tar', 'gz', 'xz', '7z'].includes(ext)) return 'zip';
  if (isTextFile(entry)) return 'text';
  return 'file';
}

/** 双击条目 */
function onDblClick(entry: FileEntry): void {
  if (entry.type === 'directory') {
    files.enter(entry);
    return;
  }
  if (isTextFile(entry)) {
    void openEditor(entry);
  } else {
    files.download(entry.path);
  }
}

/** 打开文本编辑器 */
async function openEditor(entry: FileEntry): Promise<void> {
  editorLoading.value = true;
  editorVisible.value = true;
  editorPath.value = entry.path;
  editorContent.value = '';
  const result = await files.readFile(entry.path);
  editorContent.value = result?.content ?? '';
  editorLoading.value = false;
}

/** 保存编辑器内容 */
async function saveEditor(): Promise<void> {
  editorSaving.value = true;
  const ok = await files.writeFile(editorPath.value, editorContent.value);
  editorSaving.value = false;
  if (ok) {
    ElMessage.success('已保存');
    await files.fetchList();
  } else {
    ElMessage.error(files.lastError ?? '保存失败');
  }
}

/** 右键菜单 */
function onContextMenu(e: MouseEvent, entry: FileEntry): void {
  e.preventDefault();
  ctxMenu.value = { visible: true, x: e.clientX, y: e.clientY, entry };
}

function closeCtxMenu(): void {
  ctxMenu.value.visible = false;
}

/** 右键操作：下载 */
function ctxDownload(): void {
  if (ctxMenu.value.entry) files.download(ctxMenu.value.entry.path);
  closeCtxMenu();
}

/** 右键操作：重命名 */
function ctxRename(): void {
  renameEntry.value = ctxMenu.value.entry;
  renameNewName.value = ctxMenu.value.entry?.name ?? '';
  renameVisible.value = true;
  closeCtxMenu();
}

/** 右键操作：复制到当前目录（副本） */
async function ctxCopy(): Promise<void> {
  const entry = ctxMenu.value.entry;
  closeCtxMenu();
  if (!entry) return;
  const dest = `${entry.path}.copy`;
  const ok = await files.copy(entry.path, dest);
  if (ok) ElMessage.success(`已复制为 ${dest.split('/').pop()}`);
  else ElMessage.error(files.lastError ?? '复制失败');
}

/** 右键操作：删除（到回收站） */
async function ctxDelete(): Promise<void> {
  const entry = ctxMenu.value.entry;
  closeCtxMenu();
  if (!entry) return;
  try {
    await ElMessageBox.confirm(`确定将「${entry.name}」移入回收站吗？`, '删除确认', {
      confirmButtonText: '移入回收站',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  const ok = await files.remove(entry.path, false);
  if (ok) ElMessage.success('已移入回收站');
  else ElMessage.error(files.lastError ?? '删除失败');
}

/** 行内操作：删除 */
async function removeEntry(entry: FileEntry): Promise<void> {
  ctxMenu.value.entry = entry;
  await ctxDelete();
}

/** 行内操作：下载 */
function downloadEntry(entry: FileEntry): void {
  files.download(entry.path);
}

/** 提交新建文件夹 */
async function submitMkdir(): Promise<void> {
  if (!mkdirName.value.trim()) return;
  const ok = await files.mkdir(mkdirName.value.trim());
  mkdirVisible.value = false;
  mkdirName.value = '';
  if (ok) ElMessage.success('文件夹已创建');
  else ElMessage.error(files.lastError ?? '创建失败');
}

/** 提交重命名 */
async function submitRename(): Promise<void> {
  if (!renameEntry.value || !renameNewName.value.trim()) return;
  const ok = await files.rename(renameEntry.value.path, renameNewName.value.trim());
  renameVisible.value = false;
  if (ok) ElMessage.success('已重命名');
  else ElMessage.error(files.lastError ?? '重命名失败');
}

/** 上传处理（el-upload http-request 自定义） */
async function handleUpload(options: UploadRequestOptions): Promise<void> {
  const raw = options.file;
  if (!raw) return;
  const ok = await files.upload([raw]);
  if (ok > 0) {
    ElMessage.success(`已上传 ${raw.name}`);
    uploadVisible.value = false;
  } else {
    ElMessage.error(files.lastError ?? '上传失败');
  }
}

/** 打开回收站 */
async function openTrash(): Promise<void> {
  trashVisible.value = true;
  await files.fetchTrash();
}

/** 回收站：恢复 */
async function restoreItem(entry: FileEntry): Promise<void> {
  const ok = await files.restoreFromTrash(entry.path);
  if (ok) ElMessage.success('已恢复');
  else ElMessage.error(files.lastError ?? '恢复失败');
}

/** 回收站：永久删除 */
async function purgeItem(entry: FileEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定永久删除「${entry.name}」吗？此操作不可恢复。`, '永久删除', {
      confirmButtonText: '永久删除',
      cancelButtonText: '取消',
      type: 'error',
    });
  } catch {
    return;
  }
  const ok = await files.remove(entry.path, true);
  if (ok) {
    ElMessage.success('已永久删除');
    await files.fetchTrash();
  } else {
    ElMessage.error(files.lastError ?? '删除失败');
  }
}

/** 回收站：清空 */
async function emptyTrash(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定清空回收站吗？所有项目将被永久删除。', '清空回收站', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'error',
    });
  } catch {
    return;
  }
  const ok = await files.emptyTrash();
  if (ok) ElMessage.success('回收站已清空');
  else ElMessage.error(files.lastError ?? '清空失败');
}

/** 排序表头点击 */
function onSort(key: FileSortKey): void {
  files.toggleSort(key);
}

/** 排序指示符 */
function sortIndicator(key: FileSortKey): string {
  if (files.sortKey !== key) return '';
  return files.sortAsc ? ' ▲' : ' ▼';
}

/** 回收站数量 */
const trashCount = computed(() => files.trash?.total ?? 0);

/** 当前用户配额信息（独立拉取，不依赖系统轮询） */
const quota = ref<UserQuotaInfo | null>(null);

async function fetchQuota(): Promise<void> {
  try {
    quota.value = await userApi.quota(files.uid);
  } catch {
    quota.value = null;
  }
}

onMounted(() => {
  void files.fetchList('');
  void fetchQuota();
});
</script>

<template>
  <div class="fm-view" @click="closeCtxMenu">
    <!-- 工具栏 -->
    <div class="fm-toolbar">
      <el-button :icon="ArrowLeft" size="small" :disabled="!files.currentPath" @click="files.goUp()">
        上级
      </el-button>

      <div class="fm-breadcrumb nx-mono">
        <template v-for="(crumb, i) in files.breadcrumbs" :key="crumb.path">
          <span
            class="fm-breadcrumb__item"
            :class="{ 'fm-breadcrumb__item--active': i === files.breadcrumbs.length - 1 }"
            @click="files.fetchList(crumb.path)"
          >{{ crumb.name }}</span>
          <span v-if="i < files.breadcrumbs.length - 1" class="fm-breadcrumb__sep">/</span>
        </template>
      </div>

      <div class="fm-toolbar__spacer" />

      <el-button :icon="Refresh" size="small" circle @click="files.fetchList()" />
      <el-button :icon="Plus" size="small" @click="mkdirVisible = true">新建文件夹</el-button>
      <el-button :icon="Upload" size="small" type="primary" @click="uploadVisible = !uploadVisible">上传</el-button>
    </div>

    <!-- 上传面板 -->
    <div v-if="uploadVisible" class="fm-upload nx-panel">
      <el-upload
        drag
        multiple
        :show-file-list="false"
        :http-request="handleUpload"
        action=""
      >
        <el-icon class="fm-upload__icon"><Upload /></el-icon>
        <div class="fm-upload__text">拖拽文件到此处，或点击选择文件上传到当前目录</div>
      </el-upload>
    </div>

    <!-- 文件列表 -->
    <div v-loading="files.loading" class="fm-list nx-panel">
      <table class="fm-table">
        <thead>
          <tr>
            <th class="fm-th fm-th--name" @click="onSort('name')">名称{{ sortIndicator('name') }}</th>
            <th class="fm-th fm-th--size" @click="onSort('size')">大小{{ sortIndicator('size') }}</th>
            <th class="fm-th fm-th--time" @click="onSort('modifiedAt')">修改时间{{ sortIndicator('modifiedAt') }}</th>
            <th class="fm-th fm-th--ops">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="files.sortedEntries.length === 0 && !files.loading">
            <td colspan="4" class="fm-empty">空目录</td>
          </tr>
          <tr
            v-for="entry in files.sortedEntries"
            :key="entry.path"
            class="fm-row"
            :class="{ 'fm-row--dir': entry.type === 'directory' }"
            @dblclick="onDblClick(entry)"
            @contextmenu="onContextMenu($event, entry)"
          >
            <td class="fm-td fm-td--name">
              <el-icon class="fm-icon" :class="`fm-icon--${fileIcon(entry)}`">
                <FolderOpened v-if="entry.type === 'directory'" />
                <Document v-else />
              </el-icon>
              <span class="fm-name" :title="entry.name">{{ entry.name }}</span>
            </td>
            <td class="fm-td fm-td--size nx-mono">
              {{ entry.type === 'directory' ? '—' : formatBytes(entry.size) }}
            </td>
            <td class="fm-td fm-td--time nx-mono">{{ formatTime(entry.modifiedAt) }}</td>
            <td class="fm-td fm-td--ops">
              <el-button
                v-if="entry.type !== 'directory'"
                :icon="Download"
                size="small"
                text
                @click.stop="downloadEntry(entry)"
              />
              <el-button
                :icon="Edit"
                size="small"
                text
                @click.stop="ctxMenu.entry = entry; ctxRename()"
              />
              <el-button
                :icon="Delete"
                size="small"
                text
                type="danger"
                @click.stop="removeEntry(entry)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 状态栏 -->
    <div class="fm-statusbar nx-mono">
      <span>{{ files.sortedEntries.length }} 个项目</span>
      <span v-if="quota">
        已用 {{ formatBytes(Number(quota.usedBytes)) }} / 配额 {{ formatBytes(Number(quota.quotaBytes)) }}
      </span>
      <span class="fm-statusbar__trash" @click="openTrash">
        回收站 ({{ trashCount }})
      </span>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.visible"
        class="fm-ctxmenu"
        :style="{ left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }"
        @click.stop
      >
        <div v-if="ctxMenu.entry?.type !== 'directory'" class="fm-ctxmenu__item" @click="ctxDownload">
          <el-icon><Download /></el-icon> 下载
        </div>
        <div class="fm-ctxmenu__item" @click="ctxRename">
          <el-icon><Edit /></el-icon> 重命名
        </div>
        <div class="fm-ctxmenu__item" @click="ctxCopy">
          <el-icon><Document /></el-icon> 复制副本
        </div>
        <div class="fm-ctxmenu__item fm-ctxmenu__item--danger" @click="ctxDelete">
          <el-icon><Delete /></el-icon> 删除（到回收站）
        </div>
      </div>
    </Teleport>

    <!-- 新建文件夹对话框 -->
    <el-dialog v-model="mkdirVisible" title="新建文件夹" width="380px" append-to-body>
      <el-input v-model="mkdirName" placeholder="文件夹名称" @keyup.enter="submitMkdir" />
      <template #footer>
        <el-button @click="mkdirVisible = false">取消</el-button>
        <el-button type="primary" @click="submitMkdir">创建</el-button>
      </template>
    </el-dialog>

    <!-- 重命名对话框 -->
    <el-dialog v-model="renameVisible" title="重命名" width="380px" append-to-body>
      <el-input v-model="renameNewName" placeholder="新名称" @keyup.enter="submitRename" />
      <template #footer>
        <el-button @click="renameVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRename">确定</el-button>
      </template>
    </el-dialog>

    <!-- 文本编辑器抽屉 -->
    <el-drawer v-model="editorVisible" title="文件编辑" size="480px" append-to-body>
      <div class="fm-editor">
        <div class="fm-editor__path nx-mono">{{ editorPath }}</div>
        <el-input
          v-if="!editorLoading"
          v-model="editorContent"
          type="textarea"
          :rows="22"
          class="fm-editor__textarea nx-mono"
          spellcheck="false"
        />
        <div v-else class="fm-editor__loading">加载中…</div>
        <div class="fm-editor__actions">
          <el-button type="primary" :loading="editorSaving" @click="saveEditor">保存</el-button>
          <el-button @click="editorVisible = false">关闭</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 回收站抽屉 -->
    <el-drawer v-model="trashVisible" title="回收站" size="440px" append-to-body>
      <div class="fm-trash">
        <div class="fm-trash__header">
          <span class="nx-mono">{{ trashCount }} 个项目</span>
          <el-button size="small" type="danger" plain :disabled="trashCount === 0" @click="emptyTrash">
            清空回收站
          </el-button>
        </div>
        <div v-if="!files.trash || files.trash.entries.length === 0" class="fm-trash__empty">
          回收站为空
        </div>
        <div v-else class="fm-trash__list">
          <div v-for="item in files.trash.entries" :key="item.path" class="fm-trash__item">
            <el-icon class="fm-icon fm-icon--file"><Document /></el-icon>
            <div class="fm-trash__info">
              <div class="fm-trash__name">{{ item.name }}</div>
              <div class="fm-trash__meta nx-mono">
                {{ formatBytes(item.size) }} · {{ formatTime(item.modifiedAt) }}
              </div>
            </div>
            <el-button size="small" @click="restoreItem(item)">恢复</el-button>
            <el-button size="small" type="danger" plain @click="purgeItem(item)">永久删除</el-button>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 错误提示 -->
    <div v-if="files.lastError" class="fm-error nx-mono">{{ files.lastError }}</div>
  </div>
</template>

<style scoped>
.fm-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  animation: fade-up 0.3s ease both;
}

.fm-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.fm-toolbar__spacer {
  flex: 1;
}

.fm-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--nx-text-faint);
  flex-wrap: wrap;
  min-width: 0;
}

.fm-breadcrumb__item {
  cursor: pointer;
  padding: 2px 4px;
  transition: color 0.15s;
}

.fm-breadcrumb__item:hover {
  color: var(--nx-amber);
}

.fm-breadcrumb__item--active {
  color: var(--nx-text);
  font-weight: 600;
}

.fm-breadcrumb__sep {
  color: var(--nx-text-faint);
  opacity: 0.5;
}

.fm-upload {
  padding: 8px;
}

.fm-upload :deep(.el-upload-dragger) {
  background: var(--nx-bg-sunken);
  border: 1px dashed var(--nx-border-strong);
  border-radius: 0;
  padding: 18px;
}

.fm-upload__icon {
  font-size: 28px;
  color: var(--nx-amber);
}

.fm-upload__text {
  font-size: 12px;
  color: var(--nx-text-faint);
  margin-top: 6px;
}

.fm-list {
  flex: 1;
  overflow: auto;
  padding: 0;
  min-height: 200px;
}

.fm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.fm-th {
  text-align: left;
  padding: 8px 12px;
  font-family: var(--nx-font-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--nx-text-faint);
  border-bottom: 1px solid var(--nx-border);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  position: sticky;
  top: 0;
  background: var(--nx-surface);
  z-index: 1;
}

.fm-th--ops {
  cursor: default;
  text-align: right;
}

.fm-th--size,
.fm-th--time {
  width: 110px;
}

.fm-row {
  border-bottom: 1px solid var(--nx-border-faint);
  transition: background 0.12s;
}

.fm-row:hover {
  background: var(--nx-bg-sunken);
}

.fm-row--dir {
  cursor: pointer;
}

.fm-td {
  padding: 7px 12px;
  color: var(--nx-text);
  vertical-align: middle;
}

.fm-td--name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.fm-td--size,
.fm-td--time {
  font-size: 11px;
  color: var(--nx-text-faint);
  white-space: nowrap;
}

.fm-td--ops {
  text-align: right;
  white-space: nowrap;
}

.fm-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm-icon {
  flex-shrink: 0;
  font-size: 15px;
}

.fm-icon--dir {
  color: var(--nx-amber);
}

.fm-icon--text {
  color: var(--nx-text-faint);
}

.fm-icon--img {
  color: var(--el-color-success);
}

.fm-icon--pdf {
  color: var(--el-color-danger);
}

.fm-icon--zip {
  color: var(--el-color-warning);
}

.fm-empty {
  text-align: center;
  color: var(--nx-text-faint);
  font-size: 12px;
  padding: 32px 0;
}

.fm-statusbar {
  display: flex;
  align-items: center;
  gap: 18px;
  font-size: 11px;
  color: var(--nx-text-faint);
  padding: 4px 2px;
}

.fm-statusbar__trash {
  margin-left: auto;
  cursor: pointer;
  color: var(--nx-amber);
  transition: opacity 0.15s;
}

.fm-statusbar__trash:hover {
  opacity: 0.75;
  text-decoration: underline;
}

.fm-ctxmenu {
  position: fixed;
  z-index: 3000;
  min-width: 180px;
  background: var(--nx-surface);
  border: 1px solid var(--nx-border-strong);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  padding: 4px 0;
}

.fm-ctxmenu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--nx-text);
  cursor: pointer;
  transition: background 0.12s;
}

.fm-ctxmenu__item:hover {
  background: var(--nx-bg-sunken);
}

.fm-ctxmenu__item--danger {
  color: var(--el-color-danger);
}

.fm-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
}

.fm-editor__path {
  font-size: 11px;
  color: var(--nx-text-faint);
  word-break: break-all;
}

.fm-editor__textarea :deep(textarea) {
  font-family: var(--nx-font-mono);
  font-size: 12px;
  background: var(--nx-bg-sunken);
  border-radius: 0;
}

.fm-editor__loading {
  color: var(--nx-text-faint);
  font-size: 12px;
  padding: 20px 0;
}

.fm-editor__actions {
  display: flex;
  gap: 10px;
}

.fm-trash__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 11px;
  color: var(--nx-text-faint);
}

.fm-trash__empty {
  color: var(--nx-text-faint);
  font-size: 12px;
  padding: 24px 0;
  text-align: center;
}

.fm-trash__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fm-trash__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--nx-border-faint);
  background: var(--nx-bg-sunken);
}

.fm-trash__info {
  flex: 1;
  min-width: 0;
}

.fm-trash__name {
  font-size: 13px;
  color: var(--nx-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm-trash__meta {
  font-size: 10px;
  color: var(--nx-text-faint);
  margin-top: 2px;
}

.fm-error {
  font-size: 11px;
  color: var(--el-color-danger);
}

@media (max-width: 700px) {
  .fm-th--time,
  .fm-td--time {
    display: none;
  }
}
</style>
