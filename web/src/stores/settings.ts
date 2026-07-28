/**
 * 系统设置中心 Store
 * 管理设置数据、服务列表、日志、关于信息
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { settingsApi } from '@/api';
import type {
  SystemSettings,
  SettingsSection,
  ManagedService,
  AboutInfo,
  SettingsLogLine,
  SettingsLogSource,
} from '@/api/types';

export interface SectionItem {
  id: string;
  label: string;
  icon: string;
}

export const useSettingsStore = defineStore('settings', () => {
  /* ---------- state ---------- */
  const activeSection = ref('general');
  const settings = ref<SystemSettings | null>(null);
  const services = ref<ManagedService[]>([]);
  const about = ref<AboutInfo | null>(null);
  const logs = ref<SettingsLogLine[]>([]);
  const logSources = ref<SettingsLogSource[]>([]);
  const logTotal = ref(0);
  const dirty = ref(false);
  const saving = ref(false);
  const loading = ref(false);

  /* ---------- getters ---------- */
  const sectionList = computed<SectionItem[]>(() => [
    { id: 'general', label: '常规', icon: 'Setting' },
    { id: 'users', label: '用户', icon: 'User' },
    { id: 'network', label: '网络', icon: 'Connection' },
    { id: 'services', label: '服务', icon: 'Operation' },
    { id: 'security', label: '安全', icon: 'Lock' },
    { id: 'storage', label: '存储', icon: 'Coin' },
    { id: 'power', label: '电源', icon: 'Lightning' },
    { id: 'notification', label: '通知', icon: 'Bell' },
    { id: 'llm', label: 'AI 助手', icon: 'MagicStick' },
    { id: 'update', label: '更新', icon: 'Upload' },
    { id: 'logs', label: '日志', icon: 'Document' },
    { id: 'about', label: '关于', icon: 'InfoFilled' },
  ]);

  /* ---------- actions ---------- */

  async function fetchSettings(): Promise<void> {
    loading.value = true;
    try {
      settings.value = await settingsApi.getAll();
    } finally {
      loading.value = false;
    }
  }

  async function saveSection(section: SettingsSection, data: Record<string, unknown>): Promise<void> {
    saving.value = true;
    try {
      await settingsApi.updateSection(section, data);
      // 更新本地缓存
      if (settings.value) {
        (settings.value as Record<string, unknown>)[section] = {
          ...(settings.value[section] as Record<string, unknown>),
          ...data,
        };
      }
      dirty.value = false;
    } finally {
      saving.value = false;
    }
  }

  async function fetchServices(): Promise<void> {
    const res = await settingsApi.services();
    services.value = res.services;
  }

  async function toggleService(name: string, enabled: boolean): Promise<void> {
    const result = await settingsApi.toggleService(name, enabled);
    const svc = services.value.find((s) => s.name === name);
    if (svc) {
      svc.enabled = result.enabled;
      svc.running = result.running;
    }
  }

  async function restartService(name: string): Promise<void> {
    const result = await settingsApi.restartService(name);
    const svc = services.value.find((s) => s.name === name);
    if (svc) {
      svc.running = result.running;
      svc.pid = result.pid;
    }
  }

  async function fetchAbout(): Promise<void> {
    about.value = await settingsApi.about();
  }

  async function fetchLogs(source: string, lines = 200, level?: string): Promise<void> {
    const res = await settingsApi.logs(source, lines, level);
    logs.value = res.lines;
    logTotal.value = res.total;
  }

  async function fetchLogSources(): Promise<void> {
    const res = await settingsApi.logSources();
    logSources.value = res.sources;
  }

  function markDirty(): void {
    dirty.value = true;
  }

  return {
    activeSection,
    settings,
    services,
    about,
    logs,
    logSources,
    logTotal,
    dirty,
    saving,
    loading,
    sectionList,
    fetchSettings,
    saveSection,
    fetchServices,
    toggleService,
    restartService,
    fetchAbout,
    fetchLogs,
    fetchLogSources,
    markDirty,
  };
});
