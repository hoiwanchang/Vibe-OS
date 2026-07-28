/**
 * 应用中心状态仓库
 * 注册表浏览、已安装应用管理、部署、LLM 分析
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { appsApi } from '@/api';
import type {
  AnalyzeRepoRequest,
  AnalyzeRepoResult,
  DeployCustomRequest,
  DeployFromRegistryRequest,
  InstalledAppWithStatus,
  LlmConfig,
  RegistryApp,
} from '@/api/types';

export const useAppCenterStore = defineStore('appcenter', () => {
  const registry = ref<RegistryApp[]>([]);
  const installed = ref<InstalledAppWithStatus[]>([]);
  const loading = ref(false);
  const deploying = ref(false);
  const analyzing = ref(false);
  const lastError = ref<string | null>(null);

  /** 正在操作中的应用 id 集合 */
  const busy = ref<Set<string>>(new Set());

  /** 运行中的应用数 */
  const runningCount = computed(
    () => installed.value.filter((a) => a.status === 'running').length,
  );

  /** 已安装应用的 id 集合（用于商店中标记已安装） */
  const installedIds = computed(
    () => new Set(installed.value.map((a) => a.appId)),
  );

  /** 按分类分组注册表 */
  const registryByCategory = computed(() => {
    const map = new Map<string, RegistryApp[]>();
    for (const app of registry.value) {
      const list = map.get(app.category) ?? [];
      list.push(app);
      map.set(app.category, list);
    }
    return map;
  });

  /** 拉取注册表 */
  async function fetchRegistry(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      registry.value = await appsApi.registry();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 拉取已安装应用 */
  async function fetchInstalled(): Promise<void> {
    loading.value = true;
    lastError.value = null;
    try {
      installed.value = await appsApi.installed();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 拉取全部数据 */
  async function fetchAll(): Promise<void> {
    await Promise.all([fetchRegistry(), fetchInstalled()]);
  }

  /** 从注册表部署 */
  async function deployFromRegistry(payload: DeployFromRegistryRequest): Promise<void> {
    deploying.value = true;
    lastError.value = null;
    try {
      await appsApi.deploy(payload);
      await fetchInstalled();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      deploying.value = false;
    }
  }

  /** 自定义部署 */
  async function deployCustom(payload: DeployCustomRequest): Promise<void> {
    deploying.value = true;
    lastError.value = null;
    try {
      await appsApi.deployCustom(payload);
      await fetchInstalled();
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      deploying.value = false;
    }
  }

  /** 卸载应用 */
  async function uninstall(appId: string): Promise<void> {
    busy.value.add(appId);
    try {
      await appsApi.uninstall(appId);
      await fetchInstalled();
    } finally {
      busy.value.delete(appId);
    }
  }

  /** 重启应用 */
  async function restart(appId: string): Promise<void> {
    busy.value.add(appId);
    try {
      await appsApi.restart(appId);
      await fetchInstalled();
    } finally {
      busy.value.delete(appId);
    }
  }

  /** 停止应用 */
  async function stop(appId: string): Promise<void> {
    busy.value.add(appId);
    try {
      await appsApi.stop(appId);
      await fetchInstalled();
    } finally {
      busy.value.delete(appId);
    }
  }

  /** LLM 分析 Git 仓库 */
  async function analyzeRepo(payload: AnalyzeRepoRequest): Promise<AnalyzeRepoResult> {
    analyzing.value = true;
    lastError.value = null;
    try {
      return await appsApi.analyze(payload);
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      analyzing.value = false;
    }
  }

  /** 获取 LLM 配置 */
  async function fetchLlmConfig(): Promise<{ config: LlmConfig | null; configured: boolean }> {
    return appsApi.llmConfig();
  }

  /** 保存 LLM 配置 */
  async function saveLlmConfig(config: LlmConfig): Promise<void> {
    await appsApi.setLlmConfig(config);
  }

  return {
    registry,
    installed,
    loading,
    deploying,
    analyzing,
    lastError,
    busy,
    runningCount,
    installedIds,
    registryByCategory,
    fetchRegistry,
    fetchInstalled,
    fetchAll,
    deployFromRegistry,
    deployCustom,
    uninstall,
    restart,
    stop,
    analyzeRepo,
    fetchLlmConfig,
    saveLlmConfig,
  };
});
