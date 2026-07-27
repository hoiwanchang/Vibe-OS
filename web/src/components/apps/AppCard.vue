<script setup lang="ts">
/**
 * 应用卡片：展示容器运行状态与快捷操作（重启/停止/日志/卸载）
 */
import { computed } from 'vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import type { ContainerInfo } from '@/api/types';

const props = defineProps<{
  container: ContainerInfo;
  /** 是否正在执行操作 */
  busy: boolean;
}>();

const emit = defineEmits<{
  restart: [name: string];
  stop: [name: string];
  logs: [name: string];
  remove: [name: string];
}>();

const running = computed(() => props.container.state === 'running');

function tone(state: string): 'ok' | 'warn' | 'error' | 'off' {
  if (state === 'running') return 'ok';
  if (state === 'paused' || state === 'restarting') return 'warn';
  if (state === 'exited') return 'off';
  return 'error';
}

/** 从镜像名提取展示用首字母 */
const initial = computed(() =>
  (props.container.name.charAt(0) || '?').toUpperCase(),
);
</script>

<template>
  <div class="app-card nx-panel">
    <div class="app-head">
      <div class="app-avatar">{{ initial }}</div>
      <div class="app-id">
        <div class="app-name nx-mono">{{ container.name }}</div>
        <div class="app-image nx-mono">{{ container.image }}</div>
      </div>
      <StatusBadge :tone="tone(container.state)" :text="container.status" />
    </div>

    <div class="app-meta nx-mono">
      <span v-if="container.ports">{{ container.ports }}</span>
      <span v-else class="app-meta-dim">无端口映射</span>
      <span class="app-meta-dim">创建于 {{ container.createdAt }}</span>
    </div>

    <div class="app-actions">
      <el-button
        size="small"
        :disabled="busy"
        :loading="busy"
        @click="emit('restart', container.name)"
      >
        <el-icon><RefreshRight /></el-icon>重启
      </el-button>
      <el-button
        size="small"
        :disabled="busy || !running"
        @click="emit('stop', container.name)"
      >
        <el-icon><VideoPause /></el-icon>停止
      </el-button>
      <el-button size="small" :disabled="busy" @click="emit('logs', container.name)">
        <el-icon><Document /></el-icon>日志
      </el-button>
      <el-button
        size="small"
        type="danger"
        plain
        :disabled="busy"
        @click="emit('remove', container.name)"
      >
        <el-icon><Delete /></el-icon>卸载
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.app-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: transform 0.2s ease, border-color 0.25s ease;
}

.app-card:hover {
  transform: translateY(-2px);
  border-color: var(--nx-primary-dim);
}

.app-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-avatar {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Space Grotesk', monospace;
  font-size: 20px;
  font-weight: 700;
  color: #062030;
  background: linear-gradient(135deg, var(--nx-primary), var(--nx-teal));
}

.app-id {
  flex: 1;
  min-width: 0;
}

.app-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--nx-text);
}

.app-image {
  font-size: 11.5px;
  color: var(--nx-text-faint);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11.5px;
  color: var(--nx-text-dim);
  padding: 10px 12px;
  background: rgba(57, 213, 255, 0.04);
  border-radius: 8px;
  border: 1px dashed var(--nx-border);
}

.app-meta-dim {
  color: var(--nx-text-faint);
}

.app-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
