<script setup lang="ts">
/**
 * 页面3：用户与权限管理
 * - 可视化创建用户（自动生成 /data/{uid}/ 目录）
 * - 用户配额与使用量表格
 * - Tailscale ACL 策略可视化编辑
 */
import { onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import AclEditor from '@/components/users/AclEditor.vue';
import CreateUserDialog from '@/components/users/CreateUserDialog.vue';
import SectionHead from '@/components/common/SectionHead.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import { useUsersStore } from '@/stores/users';
import { formatBytes, usageLevel } from '@/utils/format';

const store = useUsersStore();
const { users, loading } = storeToRefs(store);

const createVisible = ref(false);

onMounted(() => {
  void store.fetchUsers();
});

function quotaProgressType(percent: number): 'success' | 'warning' | 'danger' {
  const level = usageLevel(percent);
  return level === 'ok' ? 'success' : level === 'warn' ? 'warning' : 'danger';
}
</script>

<template>
  <div class="users-view">
    <SectionHead title="用户列表" icon="UserFilled">
      <template #actions>
        <el-button
          circle
          size="small"
          :loading="loading"
          @click="store.fetchUsers()"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button type="primary" @click="createVisible = true">
          <el-icon><Plus /></el-icon>创建用户
        </el-button>
      </template>
    </SectionHead>

    <div class="nx-panel">
      <el-table v-loading="loading" :data="users" size="default">
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="user-avatar">{{ row.username.charAt(0).toUpperCase() }}</div>
              <div>
                <div class="user-name">{{ row.username }}</div>
                <div class="user-uid nx-mono">UID {{ row.uid }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="数据目录" min-width="160">
          <template #default="{ row }">
            <span class="nx-mono dir-cell">{{ row.dataDir }}</span>
          </template>
        </el-table-column>
        <el-table-column label="目录状态" width="110">
          <template #default="{ row }">
            <StatusBadge
              :tone="row.dirExists ? 'ok' : 'error'"
              :text="row.dirExists ? '已初始化' : '缺失'"
            />
          </template>
        </el-table-column>
        <el-table-column label="配额使用" min-width="220">
          <template #default="{ row }">
            <div class="quota-cell">
              <el-progress
                :percentage="Math.min(row.usagePercent, 100)"
                :stroke-width="8"
                :show-text="false"
                :status="quotaProgressType(row.usagePercent)"
              />
              <div class="quota-text nx-mono">
                {{ formatBytes(row.usedBytes) }} / {{ formatBytes(row.quotaBytes) }}
                （{{ row.usagePercent.toFixed(1) }}%）
              </div>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <SectionHead title="访问控制" icon="Lock" />
    <AclEditor />

    <CreateUserDialog v-model:visible="createVisible" />
  </div>
</template>

<style scoped>
.users-view {
  animation: fade-up 0.4s ease both;
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--nx-font-display);
  font-weight: 700;
  font-size: 15px;
  color: #000;
  background: var(--nx-amber);
  border: 1px solid var(--nx-border-strong);
}

.user-name {
  font-weight: 600;
  color: var(--nx-text);
}

.user-uid {
  font-size: 11px;
  color: var(--nx-text-faint);
  margin-top: 2px;
}

.dir-cell {
  font-size: 12px;
  color: var(--nx-text-dim);
}

.quota-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.quota-text {
  font-size: 11px;
  color: var(--nx-text-faint);
}
</style>
