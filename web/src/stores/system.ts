/**
 * 系统总览状态仓库
 * 聚合系统指标、硬件健康、容器概览、Tailscale 状态
 * 提供 5 秒自动轮询与硬件异常告警检测
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { containerApi, systemApi, tailscaleApi } from '@/api';
import { t } from '@/i18n';
import type {
  ContainerInfo,
  DiskHealthResponse,
  NetworkDriversResponse,
  SystemOverview,
  TailscaleStatusResponse,
} from '@/api/types';
import { useNotificationStore } from '@/stores/notification';

/** 硬件告警条目 */
export interface HardwareAlert {
  id: string;
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
}

/** 轮询间隔（毫秒） */
export const POLL_INTERVAL_MS = 5000;

/** 趋势历史保留点数（30 × 5s = 2.5 分钟） */
const HISTORY_LIMIT = 30;

export const useSystemStore = defineStore('system', () => {
  const overview = ref<SystemOverview | null>(null);
  const diskHealth = ref<DiskHealthResponse | null>(null);
  const network = ref<NetworkDriversResponse | null>(null);
  const containers = ref<ContainerInfo[]>([]);
  const tailscale = ref<TailscaleStatusResponse | null>(null);
  const loading = ref(false);
  const lastError = ref<string | null>(null);
  /** 已确认（关闭）的告警 ID 集合 */
  const acknowledged = ref<Set<string>>(new Set());
  /** CPU 使用率历史（用于趋势迷你图） */
  const cpuHistory = ref<number[]>([]);
  /** 内存使用率历史 */
  const memHistory = ref<number[]>([]);

  /** 从磁盘 SMART 与网卡状态中提取硬件告警 */
  const alerts = computed<HardwareAlert[]>(() => {
    const list: HardwareAlert[] = [];

    for (const disk of diskHealth.value?.disks ?? []) {
      if (!disk.healthy) {
        list.push({
          id: `disk:${disk.device}`,
          severity: 'critical',
          title: t('systemAlerts.smartTitle', { device: disk.device }),
          detail: t('systemAlerts.smartDetail', {
            model: disk.model ?? t('systemAlerts.unknownModel'),
            serial: disk.serial ?? '—',
            hours: disk.powerOnHours ?? '—',
            temp: disk.temperature ?? '—',
          }),
        });
      }
    }

    for (const nic of network.value?.interfaces ?? []) {
      // 仅对物理网卡（有驱动绑定）告警，跳过 lo / tailscale0 等虚拟接口
      if (nic.driver && nic.driver !== 'tun' && !nic.linkDetected) {
        list.push({
          id: `nic:${nic.name}`,
          severity: 'warning',
          title: t('systemAlerts.nicDownTitle', { name: nic.name }),
          detail: t('systemAlerts.nicDownDetail', { name: nic.name, driver: nic.driver }),
        });
      }
    }

    return list;
  });

  /** 未确认的告警 */
  const activeAlerts = computed(() =>
    alerts.value.filter((a) => !acknowledged.value.has(a.id)),
  );

  /** 拉取全部仪表盘数据（并发请求，单项失败不影响其他） */
  async function fetchAll(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      const [ov, dh, nw, ct, ts] = await Promise.allSettled([
        systemApi.overview(),
        systemApi.diskHealth(),
        systemApi.networkDrivers(),
        containerApi.list(),
        tailscaleApi.status(),
      ]);
      if (ov.status === 'fulfilled') {
        overview.value = ov.value;
        // 追加趋势数据点（环形缓冲，超限截断头部）
        cpuHistory.value = [...cpuHistory.value, ov.value.cpu.usagePercent].slice(-HISTORY_LIMIT);
        memHistory.value = [...memHistory.value, ov.value.memory.usedPercent].slice(-HISTORY_LIMIT);
      }
      if (dh.status === 'fulfilled') diskHealth.value = dh.value;
      if (nw.status === 'fulfilled') network.value = nw.value;
      if (ct.status === 'fulfilled') containers.value = ct.value;
      if (ts.status === 'fulfilled') tailscale.value = ts.value;

      // 通知未读计数（任务栏铃铛角标，轻量请求，失败静默）
      await useNotificationStore().fetchUnreadCount();

      const firstError = [ov, dh, nw, ct, ts].find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (firstError) {
        lastError.value = String(
          firstError.reason instanceof Error
            ? firstError.reason.message
            : firstError.reason,
        );
      }
    } finally {
      loading.value = false;
    }
  }

  /** 确认（关闭）告警 */
  function acknowledgeAlert(id: string): void {
    acknowledged.value.add(id);
  }

  /** 重置告警确认状态（告警消失后重新出现时可再次提醒） */
  function resetAcknowledged(): void {
    const currentIds = new Set(alerts.value.map((a) => a.id));
    acknowledged.value = new Set(
      [...acknowledged.value].filter((id) => currentIds.has(id)),
    );
  }

  return {
    overview,
    diskHealth,
    network,
    containers,
    tailscale,
    loading,
    lastError,
    alerts,
    activeAlerts,
    cpuHistory,
    memHistory,
    fetchAll,
    acknowledgeAlert,
    resetAcknowledged,
  };
});
