<script setup lang="ts">
/**
 * 页面2：AI 应用管理中心
 * - 一键部署/卸载 AI 应用（自动创建 /data/naisys/{appname}/ 并绑定容器卷）
 * - 自然语言指令配置应用参数，调用后端 API 完成变更
 * - 容器生命周期操作：重启 / 停止 / 日志
 */
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import AppCard from '@/components/apps/AppCard.vue';
import DeployDialog from '@/components/apps/DeployDialog.vue';
import LogsDialog from '@/components/apps/LogsDialog.vue';
import NlCommandBar from '@/components/apps/NlCommandBar.vue';
import SectionHead from '@/components/common/SectionHead.vue';
import { useAppsStore } from '@/stores/apps';

const store = useAppsStore();
const { containers, loading, busy, runningCount } = storeToRefs(store);

const deployVisible = ref(false);
const logsVisible = ref(false);
const logsTarget = ref<string | null>(null);

onMounted(() => {
  void store.fetchContainers();
});

function openLogs(name: string): void {
  logsTarget.value = name;
  logsVisible.value = true;
}

async function handleRestart(name: string): Promise<void> {
  try {
    await store.restartApp(name);
    ElMessage.success(`容器 ${name} 已重启`);
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function handleStop(name: string): Promise<void> {
  try {
    await store.stopApp(name);
    ElMessage.success(`容器 ${name} 已停止`);
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function handleRemove(name: string): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定卸载应用 ${name} 吗？容器将被删除，/data/naisys/${name}/ 下的模型与数据会保留。`,
      '卸载确认',
      { confirmButtonText: '卸载', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return; // 用户取消
  }
  try {
    await store.removeApp(name, true);
    ElMessage.success(`应用 ${name} 已卸载`);
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="apps-view">
    <!-- 自然语言指令台 -->
    <NlCommandBar />

    <SectionHead title="已部署应用" icon="Grid">
      <template #actions>
        <el-tag effect="plain" size="small">
          运行中 {{ runningCount }} / {{ containers.length }}
        </el-tag>
        <el-button
          circle
          size="small"
          :loading="loading"
          @click="store.fetchContainers()"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button type="primary" @click="deployVisible = true">
          <el-icon><Plus /></el-icon>部署应用
        </el-button>
      </template>
    </SectionHead>

    <div v-loading="loading" class="apps-grid">
      <AppCard
        v-for="c in containers"
        :key="c.id"
        :container="c"
        :busy="busy.has(c.name)"
        @restart="handleRestart"
        @stop="handleStop"
        @logs="openLogs"
        @remove="handleRemove"
      />
      <el-empty
        v-if="!loading && containers.length === 0"
        description="尚未部署任何 AI 应用，点击上方「部署应用」或使用自然语言指令"
        class="apps-empty"
      />
    </div>

    <DeployDialog v-model:visible="deployVisible" />
    <LogsDialog v-model:visible="logsVisible" :name="logsTarget" />
  </div>
</template>

<style scoped>
.apps-view {
  animation: fade-up 0.4s ease both;
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  min-height: 120px;
}

.apps-empty {
  grid-column: 1 / -1;
}

@media (max-width: 860px) {
  .apps-grid {
    grid-template-columns: 1fr;
  }
}
</style>
