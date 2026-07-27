<script setup lang="ts">
/**
 * 资源监视器窗口：CPU / 内存 / 存储的实时详细监视
 * 大号趋势图 + 当前值 + 挂载点明细，数据由桌面层统一轮询
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import TrendSparkline from '@/components/common/TrendSparkline.vue';
import { useSystemStore } from '@/stores/system';
import { formatBytes } from '@/utils/format';

const system = useSystemStore();
const { overview, cpuHistory, memHistory } = storeToRefs(system);

/** 使用率颜色 */
function levelColor(pct: number): string {
  if (pct >= 90) return 'var(--nx-red)';
  if (pct >= 75) return 'var(--nx-amber)';
  return 'var(--nx-green)';
}

/** 数据盘挂载点（/data 前缀） */
const dataMounts = computed(() =>
  (overview.value?.storage ?? []).filter((p) => p.mountPoint.startsWith('/data')),
);

/** 系统负载格式化 */
const loadAvg = computed(() =>
  (overview.value?.system.loadAvg ?? []).map((l) => l.toFixed(2)).join('  /  '),
);
</script>

<template>
  <div class="monitor-view">
    <!-- CPU -->
    <div class="nx-panel monitor-card">
      <div class="monitor-card__head">
        <span class="nx-metric-label">CPU 使用率</span>
        <span class="monitor-card__value" :style="{ color: levelColor(overview?.cpu.usagePercent ?? 0) }">
          {{ (overview?.cpu.usagePercent ?? 0).toFixed(1) }}%
        </span>
      </div>
      <TrendSparkline
        v-if="cpuHistory.length >= 2"
        :points="cpuHistory"
        :color="levelColor(overview?.cpu.usagePercent ?? 0)"
        :width="760"
        :height="120"
        class="monitor-spark"
      />
      <div v-else class="monitor-placeholder">收集数据中…</div>
      <div class="monitor-meta nx-mono">
        {{ overview?.system.cpuCores ?? '—' }} 核 · 负载 {{ loadAvg || '—' }}
      </div>
    </div>

    <!-- 内存 -->
    <div class="nx-panel monitor-card">
      <div class="monitor-card__head">
        <span class="nx-metric-label">内存使用率</span>
        <span class="monitor-card__value" :style="{ color: levelColor(overview?.memory.usedPercent ?? 0) }">
          {{ (overview?.memory.usedPercent ?? 0).toFixed(1) }}%
        </span>
      </div>
      <TrendSparkline
        v-if="memHistory.length >= 2"
        :points="memHistory"
        :color="levelColor(overview?.memory.usedPercent ?? 0)"
        :width="760"
        :height="120"
        class="monitor-spark"
      />
      <div v-else class="monitor-placeholder">收集数据中…</div>
      <div class="monitor-meta nx-mono">
        {{ formatBytes(overview?.memory.usedBytes) }} / {{ formatBytes(overview?.memory.totalBytes) }}
      </div>
    </div>

    <!-- 存储挂载点 -->
    <div class="nx-panel monitor-card">
      <div class="monitor-card__head">
        <span class="nx-metric-label">数据盘挂载点</span>
        <span class="monitor-card__value-sm">{{ dataMounts.length }} 个</span>
      </div>
      <div v-if="dataMounts.length === 0" class="monitor-placeholder">
        未发现 /data 挂载点
      </div>
      <div v-else class="monitor-mounts">
        <div v-for="m in dataMounts" :key="m.mountPoint" class="monitor-mount">
          <div class="monitor-mount__path nx-mono">{{ m.mountPoint }}</div>
          <div class="monitor-mount__bar">
            <div
              class="monitor-mount__fill"
              :style="{ width: `${m.usedPercent}%`, background: levelColor(m.usedPercent) }"
            />
          </div>
          <div class="monitor-mount__val nx-mono">
            {{ m.usedPercent.toFixed(1) }}% · {{ formatBytes(m.usedBytes) }} / {{ formatBytes(m.totalBytes) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.monitor-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: fade-up 0.3s ease both;
}

.monitor-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.monitor-card__value {
  font-family: var(--nx-font-display);
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
}

.monitor-card__value-sm {
  font-family: var(--nx-font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--nx-text-dim);
}

.monitor-spark {
  width: 100%;
  height: auto;
}

.monitor-placeholder {
  color: var(--nx-text-faint);
  font-size: 12px;
  padding: 24px 0;
  text-align: center;
}

.monitor-meta {
  margin-top: 10px;
  font-size: 12px;
  color: var(--nx-text-dim);
}

.monitor-mounts {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.monitor-mount {
  display: grid;
  grid-template-columns: 220px 1fr 220px;
  align-items: center;
  gap: 12px;
}

.monitor-mount__path {
  font-size: 11px;
  color: var(--nx-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitor-mount__bar {
  height: 8px;
  background: var(--nx-border-faint);
  border: 1px solid var(--nx-border);
  overflow: hidden;
}

.monitor-mount__fill {
  height: 100%;
  transition: width 0.9s cubic-bezier(0.4, 0, 0.2, 1);
}

.monitor-mount__val {
  font-size: 11px;
  color: var(--nx-text-dim);
  text-align: right;
}

@media (max-width: 760px) {
  .monitor-mount {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .monitor-mount__val {
    text-align: left;
  }
}
</style>
