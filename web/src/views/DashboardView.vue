<script setup lang="ts">
/**
 * 系统总览仪表盘（桌面窗口内容）
 * - 存储池 / CPU / 内存条形仪表 + 语义色 + 趋势迷你图
 * - Tailscale 节点在线状态、Docker 容器运行概览
 * - 硬件告警页内横幅（全局弹窗由桌面层统一驱动）
 * - 数据由桌面层统一轮询，本组件仅做展示
 */
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import SectionHead from '@/components/common/SectionHead.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import StorageBar from '@/components/common/StorageBar.vue';
import TrendSparkline from '@/components/common/TrendSparkline.vue';
import UsageGauge from '@/components/common/UsageGauge.vue';
import { useSystemStore } from '@/stores/system';
import { formatBytes, formatTime, formatUptime } from '@/utils/format';

const store = useSystemStore();
const {
  overview,
  diskHealth,
  network,
  containers,
  tailscale,
  loading,
  activeAlerts,
  cpuHistory,
  memHistory,
} = storeToRefs(store);

/** 数据盘（/data 前缀挂载点）聚合使用率 */
const dataPool = computed(() => {
  const pools = overview.value?.storage ?? [];
  const dataPools = pools.filter((p) => p.mountPoint.startsWith('/data'));
  const target = dataPools.length > 0 ? dataPools : pools;
  const total = target.reduce((s, p) => s + p.totalBytes, 0);
  const used = target.reduce((s, p) => s + p.usedBytes, 0);
  return {
    percent: total > 0 ? (used / total) * 100 : 0,
    used,
    total,
  };
});

const cpuPercent = computed(() => overview.value?.cpu.usagePercent ?? 0);
const memPercent = computed(() => overview.value?.memory.usedPercent ?? 0);

const runningContainers = computed(
  () => containers.value.filter((c) => c.state === 'running').length,
);

const onlinePeers = computed(() => {
  const peers = tailscale.value?.status.peers ?? [];
  return { online: peers.filter((p) => p.online).length, total: peers.length };
});

const tsSelfOnline = computed(
  () => tailscale.value?.status.self?.online ?? false,
);

/** 容器状态 → 徽章色调 */
function containerTone(state: string): 'ok' | 'warn' | 'error' | 'off' {
  if (state === 'running') return 'ok';
  if (state === 'paused' || state === 'restarting') return 'warn';
  if (state === 'exited') return 'off';
  return 'error';
}

function peerTone(online: boolean, active: boolean): 'ok' | 'warn' | 'off' {
  if (online && active) return 'ok';
  if (online) return 'warn';
  return 'off';
}
</script>

<template>
  <div class="dashboard">
    <!-- 首屏加载骨架 -->
    <div v-if="loading && !overview" class="skeleton-grid">
      <div v-for="n in 4" :key="n" class="nx-panel skeleton-card">
        <el-skeleton animated>
          <template #template>
            <div class="skeleton-inner">
              <el-skeleton-item variant="circle" style="width: 120px; height: 120px" />
              <div class="skeleton-lines">
                <el-skeleton-item variant="text" style="width: 70%" />
                <el-skeleton-item variant="text" style="width: 90%" />
              </div>
            </div>
          </template>
        </el-skeleton>
      </div>
    </div>

    <!-- 硬件告警横幅（标红/标黄） -->
    <div v-if="activeAlerts.length > 0" class="alert-zone">
      <div
        v-for="alert in activeAlerts"
        :key="alert.id"
        class="nx-alert-banner"
        :class="`nx-alert-banner--${alert.severity}`"
      >
        <el-icon>
          <WarningFilled v-if="alert.severity === 'critical'" />
          <Bell v-else />
        </el-icon>
        <div class="alert-body">
          <div class="nx-alert-title">{{ alert.title }}</div>
          <div class="nx-alert-detail">{{ alert.detail }}</div>
        </div>
        <el-button
          size="small"
          text
          @click="store.acknowledgeAlert(alert.id)"
        >
          忽略
        </el-button>
      </div>
    </div>

    <template v-if="overview">
    <!-- 核心指标 -->
    <div class="nx-grid nx-grid--stats">
      <div class="nx-panel stat-card">
        <div class="stat-gauge">
          <UsageGauge
            :percent="dataPool.percent"
            :label="`${dataPool.percent.toFixed(1)}%`"
            caption="存储池"
          />
        </div>
        <div class="stat-meta">
          <div class="nx-metric-label">DATA POOL</div>
          <div class="stat-line nx-mono">
            {{ formatBytes(dataPool.used) }} / {{ formatBytes(dataPool.total) }}
          </div>
        </div>
      </div>

      <div class="nx-panel stat-card">
        <div class="stat-gauge">
          <UsageGauge
            :percent="cpuPercent"
            :label="`${cpuPercent.toFixed(1)}%`"
            caption="CPU"
          />
        </div>
        <div class="stat-meta">
          <div class="nx-metric-label">PROCESSOR</div>
          <div class="stat-line nx-mono">
            {{ overview?.cpu.cores ?? '—' }} 核 ·
            负载 {{ overview?.system.loadAvg[0] ?? '—' }}
          </div>
          <TrendSparkline
            v-if="cpuHistory.length >= 2"
            :points="cpuHistory"
            color="var(--nx-primary)"
            :width="140"
            :height="30"
            class="stat-spark"
          />
        </div>
      </div>

      <div class="nx-panel stat-card">
        <div class="stat-gauge">
          <UsageGauge
            :percent="memPercent"
            :label="`${memPercent.toFixed(1)}%`"
            caption="内存"
          />
        </div>
        <div class="stat-meta">
          <div class="nx-metric-label">MEMORY</div>
          <div class="stat-line nx-mono">
            {{ formatBytes(overview?.memory.usedBytes) }} /
            {{ formatBytes(overview?.memory.totalBytes) }}
          </div>
          <TrendSparkline
            v-if="memHistory.length >= 2"
            :points="memHistory"
            color="var(--nx-teal)"
            :width="140"
            :height="30"
            class="stat-spark"
          />
        </div>
      </div>

      <div class="nx-panel stat-card">
        <div class="stat-numbers">
          <div>
            <div class="nx-metric-value">
              {{ runningContainers
              }}<span class="nx-metric-unit">/ {{ containers.length }}</span>
            </div>
            <div class="nx-metric-label">DOCKER 容器运行中</div>
          </div>
          <el-divider />
          <div>
            <div class="nx-metric-value">
              {{ onlinePeers.online
              }}<span class="nx-metric-unit">/ {{ onlinePeers.total }}</span>
            </div>
            <div class="nx-metric-label">TAILSCALE 节点在线</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 存储池 + Tailscale -->
    <SectionHead title="存储池" icon="Box" />
    <div class="nx-grid nx-grid--dash">
      <div class="nx-panel">
        <div class="nx-panel-title">
          <el-icon><Box /></el-icon>挂载点使用率
        </div>
        <div v-if="overview && overview.storage.length > 0">
          <StorageBar
            v-for="pool in overview.storage"
            :key="pool.mountPoint"
            :pool="pool"
          />
        </div>
        <el-empty v-else description="暂无存储池数据" :image-size="60" />
      </div>

      <div class="nx-panel">
        <div class="nx-panel-title">
          <el-icon><Connection /></el-icon>Tailscale 网络
        </div>
        <div class="ts-self">
          <StatusBadge
            :tone="tsSelfOnline ? 'ok' : 'error'"
            :text="tailscale?.status.self?.hostname ?? '本节点'"
          />
          <span class="nx-mono ts-ip">
            {{ tailscale?.status.self?.ips.join(' / ') ?? '—' }}
          </span>
        </div>
        <el-divider style="margin: 12px 0" />
        <div v-if="(tailscale?.status.peers ?? []).length > 0" class="ts-peers">
          <div
            v-for="peer in tailscale?.status.peers"
            :key="peer.id"
            class="ts-peer"
          >
            <StatusBadge
              :tone="peerTone(peer.online, peer.active)"
              :text="peer.hostname"
            />
            <div class="ts-peer-meta nx-mono">
              {{ peer.ips.join(', ') }} · {{ peer.os }}
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无对等节点" :image-size="50" />
      </div>
    </div>

    <!-- Docker 容器 + 系统信息 -->
    <SectionHead title="Docker 容器概览" icon="Cpu" />
    <div class="nx-grid nx-grid--dash">
      <div class="nx-panel">
        <el-table
          v-loading="loading"
          :data="containers"
          size="small"
          stripe
          :header-cell-style="{ background: 'transparent' }"
        >
          <el-table-column prop="name" label="容器" min-width="120">
            <template #default="{ row }">
              <span class="nx-mono">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="image" label="镜像" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="nx-mono img-cell">{{ row.image }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="130">
            <template #default="{ row }">
              <StatusBadge :tone="containerTone(row.state)" :text="row.status" />
            </template>
          </el-table-column>
          <el-table-column prop="ports" label="端口" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="nx-mono">{{ row.ports || '—' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="nx-panel">
        <div class="nx-panel-title">
          <el-icon><InfoFilled /></el-icon>系统信息
        </div>
        <dl class="sys-info">
          <div><dt>主机名</dt><dd class="nx-mono">{{ overview?.system.hostname ?? '—' }}</dd></div>
          <div><dt>系统</dt><dd class="nx-mono">{{ overview?.system.platform ?? '—' }}</dd></div>
          <div><dt>CPU</dt><dd>{{ overview?.system.cpuModel ?? '—' }}</dd></div>
          <div><dt>运行时长</dt><dd>{{ formatUptime(overview?.system.uptimeSeconds) }}</dd></div>
          <div><dt>磁盘健康</dt>
            <dd>
              <StatusBadge
                :tone="diskHealth && diskHealth.healthyDisks < diskHealth.totalDisks ? 'error' : 'ok'"
                :text="diskHealth ? `${diskHealth.healthyDisks}/${diskHealth.totalDisks} 健康` : '—'"
              />
            </dd>
          </div>
          <div><dt>网卡链路</dt>
            <dd>
              <StatusBadge
                :tone="network?.interfaces.some((i) => i.driver && i.driver !== 'tun' && !i.linkDetected) ? 'warn' : 'ok'"
                :text="network ? `${network.interfaces.filter((i) => i.linkDetected).length}/${network.interfaces.length} 连通` : '—'"
              />
            </dd>
          </div>
          <div><dt>数据更新于</dt><dd class="nx-mono">{{ formatTime(overview?.timestamp) }}</dd></div>
        </dl>
      </div>
    </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard {
  animation: fade-up 0.4s ease both;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.skeleton-inner {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 4px;
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 860px) {
  .skeleton-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.alert-zone {
  margin-bottom: 20px;
}

.alert-body {
  flex: 1;
  min-width: 0;
}

.stat-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 18px 22px;
}

.stat-gauge {
  width: 100%;
}

.stat-meta {
  min-width: 0;
}

.stat-line {
  font-size: 12px;
  color: var(--nx-text-dim);
  margin-top: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-spark {
  margin-top: 8px;
  opacity: 0.9;
}

.stat-numbers {
  width: 100%;
}

.stat-numbers .el-divider {
  margin: 12px 0;
  border-color: var(--nx-border);
}

.ts-self {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.ts-ip {
  font-size: 12px;
  color: var(--nx-primary);
}

.ts-peers {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ts-peer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.ts-peer-meta {
  font-size: 11.5px;
  color: var(--nx-text-faint);
}

.img-cell {
  font-size: 11.5px;
  color: var(--nx-text-dim);
}

.sys-info {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.sys-info > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.sys-info dt {
  color: var(--nx-text-faint);
  flex-shrink: 0;
}

.sys-info dd {
  margin: 0;
  color: var(--nx-text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
