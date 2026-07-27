<script setup lang="ts">
/**
 * 共享文件夹窗口（P0）
 * - 共享列表表格：名称 / 路径 / 协议 / 权限 / 连接数 / 状态 / 操作
 * - 协议标签颜色区分：SMB=蓝 / NFS=绿 / WebDAV=紫
 * - 新建/编辑：el-dialog 表单（名称、路径、协议、权限、用户、主机白名单）
 * - 连接数点击展开 popover 显示连接详情
 * - 操作：编辑 / 重启服务 / 删除（二次确认）
 */
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh, Share } from '@element-plus/icons-vue';
import { useSharingStore } from '@/stores/sharing';
import type { CreateShareRequest, ShareInfo } from '@/api/types';
import { formatTime } from '@/utils/format';

const sharing = useSharingStore();

/** 编辑对话框 */
const dialogVisible = ref(false);
const editingName = ref<string | null>(null);
const submitting = ref(false);

/** 表单（reactive 便于重置） */
const form = reactive<CreateShareRequest & { validUsersText: string; hostsText: string }>({
  name: '',
  path: '',
  protocol: 'smb',
  readonly: false,
  validUsers: [],
  hosts: [],
  port: undefined,
  validUsersText: '',
  hostsText: '',
});

/** 协议标签类型 */
function protocolTag(protocol: string): 'primary' | 'success' | 'warning' {
  if (protocol === 'smb') return 'primary';
  if (protocol === 'nfs') return 'success';
  return 'warning';
}

/** 协议中文 */
function protocolText(protocol: string): string {
  return protocol.toUpperCase();
}

/** 连接数（从 status 缓存读取） */
function connectionCount(name: string): number {
  return sharing.status[name]?.connections.length ?? 0;
}

/** 服务运行状态 */
function isRunning(name: string): boolean {
  return sharing.status[name]?.running ?? false;
}

/** 打开新建对话框 */
function openCreate(): void {
  editingName.value = null;
  Object.assign(form, {
    name: '',
    path: '/data/1000/files/',
    protocol: 'smb',
    readonly: false,
    validUsers: [],
    hosts: [],
    port: undefined,
    validUsersText: '',
    hostsText: '',
  });
  dialogVisible.value = true;
}

/** 打开编辑对话框 */
function openEdit(share: ShareInfo): void {
  editingName.value = share.name;
  Object.assign(form, {
    name: share.name,
    path: share.path,
    protocol: share.protocol,
    readonly: share.readonly,
    validUsers: [...share.validUsers],
    hosts: [...share.hosts],
    port: share.port,
    validUsersText: share.validUsers.join(', '),
    hostsText: share.hosts.join(', '),
  });
  dialogVisible.value = true;
}

/** 解析逗号分隔文本为数组 */
function parseList(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

/** 提交表单（新建或更新） */
async function submit(): Promise<void> {
  if (!form.name.trim() || !form.path.trim()) {
    ElMessage.warning('请填写名称和路径');
    return;
  }
  const payload: CreateShareRequest = {
    name: form.name.trim(),
    path: form.path.trim(),
    protocol: form.protocol,
    readonly: form.readonly,
    validUsers: parseList(form.validUsersText),
    hosts: parseList(form.hostsText),
  };
  if (form.port) payload.port = form.port;

  submitting.value = true;
  const ok = editingName.value
    ? await sharing.updateShare(editingName.value, payload)
    : await sharing.createShare(payload);
  submitting.value = false;

  if (ok) {
    ElMessage.success(editingName.value ? '共享已更新' : '共享已创建');
    dialogVisible.value = false;
    // 刷新状态
    await sharing.fetchStatus(payload.name);
  } else {
    ElMessage.error(sharing.lastError ?? '操作失败');
  }
}

/** 删除共享 */
async function removeShare(share: ShareInfo): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除共享「${share.name}」吗？（不会删除实际文件）`, '删除共享', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  const ok = await sharing.removeShare(share.name);
  if (ok) ElMessage.success('共享已删除');
  else ElMessage.error(sharing.lastError ?? '删除失败');
}

/** 重启服务 */
async function restart(share: ShareInfo): Promise<void> {
  const ok = await sharing.restartService(share.name);
  if (ok) ElMessage.success(`${share.name} 服务已重启`);
  else ElMessage.error(sharing.lastError ?? '重启失败');
}

/** 展开连接详情（popover 显示时拉取） */
async function onConnectionsShow(share: ShareInfo): Promise<void> {
  await sharing.fetchStatus(share.name);
}

/** 权限文本 */
function permText(share: ShareInfo): string {
  return share.readonly ? '只读' : '读写';
}

onMounted(async () => {
  await sharing.fetchShares();
  // 拉取每个共享的状态
  await Promise.allSettled(sharing.shares.map((s) => sharing.fetchStatus(s.name)));
});
</script>

<template>
  <div class="sh-view">
    <!-- 共享列表 -->
    <div class="nx-panel sh-list">
      <div class="sh-section-title">
        <el-icon><Share /></el-icon> 共享文件夹
      </div>

      <el-table v-loading="sharing.loading" :data="sharing.shares" size="small" stripe>
        <el-table-column prop="name" label="名称" min-width="110">
          <template #default="{ row }">
            <span class="sh-name">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路径" min-width="200">
          <template #default="{ row }">
            <span class="nx-mono sh-path">{{ row.path }}</span>
          </template>
        </el-table-column>
        <el-table-column label="协议" width="90">
          <template #default="{ row }">
            <el-tag :type="protocolTag(row.protocol)" size="small">{{ protocolText(row.protocol) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权限" width="80">
          <template #default="{ row }">{{ permText(row) }}</template>
        </el-table-column>
        <el-table-column label="连接数" width="90">
          <template #default="{ row }">
            <el-popover
              placement="bottom"
              :width="260"
              trigger="click"
              @show="onConnectionsShow(row)"
            >
              <template #reference>
                <span class="sh-conn nx-mono">{{ connectionCount(row.name) }}</span>
              </template>
              <div class="sh-conn-pop">
                <div class="sh-conn-pop__title">当前连接 — {{ row.name }}</div>
                <div v-if="connectionCount(row.name) === 0" class="sh-conn-pop__empty">无活动连接</div>
                <div
                  v-for="conn in sharing.status[row.name]?.connections ?? []"
                  :key="conn.host"
                  class="sh-conn-pop__item"
                >
                  <span class="nx-mono">{{ conn.user }}@{{ conn.host }}</span>
                  <span class="nx-mono sh-conn-pop__meta">
                    {{ conn.files }} 文件 · {{ formatTime(conn.openedAt) }}
                  </span>
                </div>
              </div>
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <span
              class="nx-dot"
              :class="isRunning(row.name) ? 'nx-dot--ok' : 'nx-dot--error'"
              :title="isRunning(row.name) ? '服务运行中' : '服务已停止'"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text @click="openEdit(row)">编辑</el-button>
            <el-button size="small" text :icon="Refresh" @click="restart(row)">重启</el-button>
            <el-button size="small" text type="danger" @click="removeShare(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="sh-create">
        <el-button :icon="Plus" type="primary" @click="openCreate">新建共享</el-button>
      </div>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingName ? `编辑共享 — ${editingName}` : '新建共享'"
      width="520px"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="共享名称">
          <el-input v-model="form.name" :disabled="!!editingName" placeholder="如 docs" />
        </el-form-item>
        <el-form-item label="共享路径">
          <el-input v-model="form.path" placeholder="/data/1000/files/docs" class="nx-mono" />
        </el-form-item>
        <el-form-item label="协议">
          <el-radio-group v-model="form.protocol">
            <el-radio value="smb">SMB</el-radio>
            <el-radio value="nfs">NFS</el-radio>
            <el-radio value="webdav">WebDAV</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="访问权限">
          <el-switch v-model="form.readonly" active-text="只读" inactive-text="读写" />
        </el-form-item>
        <el-form-item label="允许用户（逗号分隔，留空=全部）">
          <el-input v-model="form.validUsersText" placeholder="kane, alice" />
        </el-form-item>
        <el-form-item label="主机白名单（逗号分隔，留空=全部）">
          <el-input v-model="form.hostsText" placeholder="192.168.50.0/24" class="nx-mono" />
        </el-form-item>
        <el-form-item v-if="form.protocol === 'webdav'" label="WebDAV 端口">
          <el-input-number v-model="form.port" :min="1024" :max="65535" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">
          {{ editingName ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sh-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: fade-up 0.3s ease both;
}

.sh-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
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

.sh-list {
  padding-bottom: 14px;
}

.sh-name {
  font-weight: 600;
  color: var(--nx-text);
}

.sh-path {
  font-size: 11px;
  color: var(--nx-text-faint);
  word-break: break-all;
}

.sh-conn {
  cursor: pointer;
  color: var(--nx-amber);
  font-size: 12px;
  padding: 2px 6px;
  border: 1px solid var(--nx-border-faint);
  transition: border-color 0.15s;
}

.sh-conn:hover {
  border-color: var(--nx-amber);
}

.sh-create {
  margin-top: 14px;
}

.sh-conn-pop__title {
  font-family: var(--nx-font-display);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--nx-amber);
  margin-bottom: 8px;
}

.sh-conn-pop__empty {
  font-size: 12px;
  color: var(--nx-text-faint);
}

.sh-conn-pop__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px solid var(--nx-border-faint);
  font-size: 12px;
  color: var(--nx-text);
}

.sh-conn-pop__item:last-child {
  border-bottom: none;
}

.sh-conn-pop__meta {
  font-size: 10px;
  color: var(--nx-text-faint);
}
</style>
