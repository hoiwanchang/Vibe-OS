<script setup lang="ts">
/**
 * 系统设置窗口：用户与权限 + 系统信息 两个标签页
 */
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import UsersView from '@/views/UsersView.vue';
import { useSystemStore } from '@/stores/system';
import { formatBytes, formatUptime } from '@/utils/format';

const activeTab = ref('users');

const system = useSystemStore();
const { overview } = storeToRefs(system);
</script>

<template>
  <div class="settings-view">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="用户与权限" name="users">
        <UsersView />
      </el-tab-pane>

      <el-tab-pane label="系统信息" name="system">
        <div class="nx-panel sysinfo">
          <dl class="sysinfo-list">
            <div><dt>主机名</dt><dd class="nx-mono">{{ overview?.system.hostname ?? '—' }}</dd></div>
            <div><dt>平台</dt><dd class="nx-mono">{{ overview?.system.platform ?? '—' }}</dd></div>
            <div><dt>架构</dt><dd class="nx-mono">{{ overview?.system.arch ?? '—' }}</dd></div>
            <div><dt>Node 版本</dt><dd class="nx-mono">{{ overview?.system.nodeVersion ?? '—' }}</dd></div>
            <div><dt>CPU 核心</dt><dd class="nx-mono">{{ overview?.system.cpuCores ?? '—' }} 核</dd></div>
            <div><dt>内存总量</dt><dd class="nx-mono">{{ formatBytes(overview?.memory.totalBytes) }}</dd></div>
            <div><dt>运行时长</dt><dd class="nx-mono">{{ formatUptime(overview?.system.uptimeSeconds) }}</dd></div>
            <div>
              <dt>系统负载</dt>
              <dd class="nx-mono">
                {{ overview?.system.loadAvg.map((l) => l.toFixed(2)).join(' / ') ?? '—' }}
              </dd>
            </div>
          </dl>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.settings-view {
  animation: fade-up 0.3s ease both;
}

.sysinfo-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
  margin: 0;
}

.sysinfo-list > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--nx-border-faint);
}

.sysinfo-list dt {
  color: var(--nx-text-faint);
  font-size: 12px;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}

.sysinfo-list dd {
  margin: 0;
  color: var(--nx-text);
  font-size: 12px;
  text-align: right;
  word-break: break-all;
}

@media (max-width: 640px) {
  .sysinfo-list {
    grid-template-columns: 1fr;
  }
}
</style>
