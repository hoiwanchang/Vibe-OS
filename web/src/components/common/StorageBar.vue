<script setup lang="ts">
/**
 * 存储池条目：设备名 + 挂载点 + 语义色进度条 + 容量明细
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { StoragePool } from '@/api/types';
import { formatBytes, usageLevel } from '@/utils/format';

const { t } = useI18n();

const props = defineProps<{ pool: StoragePool }>();

const level = computed(() => usageLevel(props.pool.usedPercent));
const progressClass = computed(() => `nx-progress--${level.value}`);
const statusType = computed(() =>
  level.value === 'ok' ? 'success' : level.value === 'warn' ? 'warning' : 'danger',
);
</script>

<template>
  <div class="pool-row">
    <div class="pool-head">
      <div class="pool-device nx-mono">
        {{ pool.device }}
        <el-tag size="small" :type="statusType" effect="plain" class="pool-fs">
          {{ pool.fsType }}
        </el-tag>
      </div>
      <div class="pool-mount nx-mono">{{ pool.mountPoint }}</div>
    </div>
    <el-progress
      :percentage="pool.usedPercent"
      :stroke-width="10"
      :show-text="false"
      :class="progressClass"
    />
    <div class="pool-detail">
      <span>
        {{ t('storageBar.used') }} <b>{{ formatBytes(pool.usedBytes) }}</b>
        / {{ formatBytes(pool.totalBytes) }}
      </span>
      <span class="pool-percent" :class="`pool-percent--${level}`">
        {{ pool.usedPercent.toFixed(1) }}%
      </span>
    </div>
  </div>
</template>

<style scoped>
.pool-row {
  padding: 14px 0;
  border-bottom: 1px dashed var(--nx-border);
}

.pool-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.pool-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
  gap: 8px;
  flex-wrap: wrap;
}

.pool-device {
  font-weight: 600;
  color: var(--nx-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.pool-mount {
  color: var(--nx-primary);
  font-size: 12px;
}

.pool-detail {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: var(--nx-text-dim);
}

.pool-detail b {
  color: var(--nx-text);
  font-weight: 600;
}

.pool-percent {
  font-family: 'Space Grotesk', monospace;
  font-weight: 700;
}

.pool-percent--ok { color: var(--nx-teal); }
.pool-percent--warn { color: var(--nx-amber); }
.pool-percent--critical { color: var(--nx-red); }
</style>
