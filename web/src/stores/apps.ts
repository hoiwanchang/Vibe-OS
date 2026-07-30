/**
 * AI 应用管理状态仓库
 * 容器列表、部署/卸载操作、自然语言指令执行
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { containerApi } from '@/api';
import type { ContainerDeployRequest, ContainerInfo } from '@/api/types';
import { parseDeployCommand, type ParsedDeployParams } from '@/utils/nl-parser';

export const useAppsStore = defineStore('apps', () => {
  const containers = ref<ContainerInfo[]>([]);
  const loading = ref(false);
  const lastError = ref<string | null>(null);
  /** 正在执行操作中的容器名集合 */
  const busy = ref<Set<string>>(new Set());

  /** 运行中的容器数 */
  const runningCount = computed(
    () => containers.value.filter((c) => c.state === 'running').length,
  );

  /** 拉取容器列表 */
  async function fetchContainers(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      containers.value = await containerApi.list();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 一键部署 AI 应用：
   * 1. 自动创建 /data/vibeos/{appname}/{models,data,logs}
   * 2. 自动绑定标准卷挂载
   * 3. 创建并启动容器
   */
  async function deployApp(payload: ContainerDeployRequest): Promise<void> {
    busy.value.add(payload.name);
    try {
      // 步骤1：初始化应用数据目录
      const dirs = await containerApi.initDirs(payload.name);
      const appDir = dirs.appDir;

      // 步骤2：合并标准卷挂载（用户自定义卷优先）
      const standardVolumes = [
        { host: `${appDir}/models`, container: '/models', readonly: true },
        { host: `${appDir}/data`, container: '/data' },
        { host: `${appDir}/logs`, container: '/logs' },
      ];
      const volumes = [...standardVolumes, ...(payload.volumes ?? [])];

      // 步骤3：部署容器
      await containerApi.deploy({
        restartPolicy: 'unless-stopped',
        ...payload,
        volumes,
      });

      await fetchContainers();
    } finally {
      busy.value.delete(payload.name);
    }
  }

  /** 卸载应用（删除容器，保留数据目录） */
  async function removeApp(name: string, force = false): Promise<void> {
    busy.value.add(name);
    try {
      await containerApi.remove(name, force);
      await fetchContainers();
    } finally {
      busy.value.delete(name);
    }
  }

  /** 重启容器 */
  async function restartApp(name: string): Promise<void> {
    busy.value.add(name);
    try {
      await containerApi.restart(name);
      await fetchContainers();
    } finally {
      busy.value.delete(name);
    }
  }

  /** 停止容器 */
  async function stopApp(name: string): Promise<void> {
    busy.value.add(name);
    try {
      await containerApi.stop(name);
      await fetchContainers();
    } finally {
      busy.value.delete(name);
    }
  }

  /**
   * 自然语言指令 → 结构化参数（前端解析，供确认弹窗展示）
   */
  function parseNaturalCommand(input: string): {
    params: ParsedDeployParams;
    summary: string[];
    warnings: string[];
  } {
    return parseDeployCommand(input);
  }

  return {
    containers,
    loading,
    lastError,
    busy,
    runningCount,
    fetchContainers,
    deployApp,
    removeApp,
    restartApp,
    stopApp,
    parseNaturalCommand,
  };
});
