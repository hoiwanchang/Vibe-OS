/**
 * 文件管理器状态仓库
 * 目录浏览 / 上传 / 下载 / 编辑 / 回收站管理
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { filesApi } from '@/api';
import { t } from '@/i18n';
import type { FileEntry, FileReadResult, TrashListResult } from '@/api/types';

/** 排序键 */
export type FileSortKey = 'name' | 'size' | 'modifiedAt';

/** 默认操作用户 uid（kane） */
const DEFAULT_UID = 1000;

export const useFilesStore = defineStore('files', () => {
  /** 当前操作用户 uid */
  const uid = ref(DEFAULT_UID);
  /** 当前相对路径（'' 为用户根） */
  const currentPath = ref('');
  /** 当前目录内容 */
  const entries = ref<FileEntry[]>([]);
  /** 选中项路径集合 */
  const selected = ref<string[]>([]);
  /** 回收站内容 */
  const trash = ref<TrashListResult | null>(null);
  /** 加载中 */
  const loading = ref(false);
  /** 排序键 */
  const sortKey = ref<FileSortKey>('name');
  /** 升序 */
  const sortAsc = ref(true);
  /** 最近一次错误 */
  const lastError = ref<string | null>(null);

  /** 面包屑层级（从根到当前） */
  const breadcrumbs = computed(() => {
    const root = t('files.root');
    if (!currentPath.value) return [{ name: root, path: '' }];
    const parts = currentPath.value.split('/').filter(Boolean);
    const crumbs = [{ name: root, path: '' }];
    let acc = '';
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      crumbs.push({ name: p, path: acc });
    }
    return crumbs;
  });

  /** 排序后的目录内容（目录在前，文件在后） */
  const sortedEntries = computed(() => {
    const dirs = entries.value.filter((e) => e.type === 'directory');
    const files = entries.value.filter((e) => e.type !== 'directory');
    const cmp = (a: FileEntry, b: FileEntry): number => {
      let r = 0;
      if (sortKey.value === 'name') r = a.name.localeCompare(b.name, 'zh-CN');
      else if (sortKey.value === 'size') r = a.size - b.size;
      else r = a.modifiedAt.localeCompare(b.modifiedAt);
      return sortAsc.value ? r : -r;
    };
    return [...dirs.sort(cmp), ...files.sort(cmp)];
  });

  /** 切换排序 */
  function toggleSort(key: FileSortKey): void {
    if (sortKey.value === key) {
      sortAsc.value = !sortAsc.value;
    } else {
      sortKey.value = key;
      sortAsc.value = true;
    }
  }

  /** 拉取目录列表 */
  async function fetchList(path?: string): Promise<void> {
    if (path !== undefined) currentPath.value = path;
    loading.value = true;
    lastError.value = null;
    try {
      const result = await filesApi.list(uid.value, currentPath.value);
      entries.value = result.entries;
      selected.value = [];
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 进入子目录 */
  function enter(entry: FileEntry): void {
    if (entry.type === 'directory') {
      void fetchList(entry.path);
    }
  }

  /** 返回上级目录 */
  function goUp(): void {
    const parts = currentPath.value.split('/').filter(Boolean);
    parts.pop();
    void fetchList(parts.join('/'));
  }

  /** 新建文件夹 */
  async function mkdir(name: string): Promise<boolean> {
    const path = currentPath.value ? `${currentPath.value}/${name}` : name;
    try {
      await filesApi.mkdir(uid.value, path);
      await fetchList();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 重命名 */
  async function rename(path: string, newName: string): Promise<boolean> {
    try {
      await filesApi.rename(uid.value, path, newName);
      await fetchList();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 删除（默认移入回收站） */
  async function remove(path: string, permanent = false): Promise<boolean> {
    try {
      await filesApi.remove(uid.value, path, permanent);
      await fetchList();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 复制 */
  async function copy(src: string, dest: string): Promise<boolean> {
    try {
      await filesApi.copy(uid.value, src, dest);
      await fetchList();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 上传多个文件到当前目录 */
  async function upload(files: File[]): Promise<number> {
    let ok = 0;
    for (const file of files) {
      try {
        await filesApi.upload(uid.value, currentPath.value, file);
        ok += 1;
      } catch (err) {
        lastError.value = err instanceof Error ? err.message : String(err);
      }
    }
    if (ok > 0) await fetchList();
    return ok;
  }

  /** 读取文件内容（用于编辑器） */
  async function readFile(path: string): Promise<FileReadResult | null> {
    try {
      return await filesApi.read(uid.value, path);
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return null;
    }
  }

  /** 写入文件内容 */
  async function writeFile(path: string, content: string): Promise<boolean> {
    try {
      await filesApi.write(uid.value, path, content);
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 下载文件（触发浏览器下载） */
  function download(path: string): void {
    const url = filesApi.downloadUrl(uid.value, path);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** 拉取回收站 */
  async function fetchTrash(): Promise<void> {
    try {
      trash.value = await filesApi.trash(uid.value);
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    }
  }

  /** 从回收站恢复（通过删除回收站条目实现） */
  async function restoreFromTrash(path: string): Promise<boolean> {
    try {
      await filesApi.remove(uid.value, path, true);
      await fetchTrash();
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /** 清空回收站 */
  async function emptyTrash(): Promise<boolean> {
    try {
      await filesApi.emptyTrash(uid.value);
      trash.value = { entries: [], total: 0 };
      return true;
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  return {
    uid,
    currentPath,
    entries,
    selected,
    trash,
    loading,
    sortKey,
    sortAsc,
    lastError,
    breadcrumbs,
    sortedEntries,
    toggleSort,
    fetchList,
    enter,
    goUp,
    mkdir,
    rename,
    remove,
    copy,
    upload,
    readFile,
    writeFile,
    download,
    fetchTrash,
    restoreFromTrash,
    emptyTrash,
  };
});
