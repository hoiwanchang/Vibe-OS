/**
 * 系统设置中心 Store
 * 管理设置数据、服务列表、日志、关于信息
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { settingsApi } from '@/api';
import { t } from '@/i18n';
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
    { id: 'general', label: t('settings.sections.general'), icon: 'Setting' },
    { id: 'users', label: t('settings.sections.users'), icon: 'User' },
    { id: 'network', label: t('settings.sections.network'), icon: 'Connection' },
    { id: 'services', label: t('settings.sections.services'), icon: 'Operation' },
    { id: 'security', label: t('settings.sections.security'), icon: 'Lock' },
    { id: 'oauth', label: '应用授权', icon: 'Key' },
    { id: 'storage', label: t('settings.sections.storage'), icon: 'Coin' },
    { id: 'power', label: t('settings.sections.power'), icon: 'Lightning' },
    { id: 'snmp', label: t('settings.sections.snmp'), icon: 'Monitor' },
    { id: 'usbbackup', label: t('settings.sections.usbBackup'), icon: 'Upload' },
    { id: 'recyclebin', label: t('settings.sections.recycleBin'), icon: 'Delete' },
    { id: 'notification', label: t('settings.sections.notification'), icon: 'Bell' },
    { id: 'llm', label: t('settings.sections.llm'), icon: 'MagicStick' },
    { id: 'update', label: t('settings.sections.update'), icon: 'Upload' },
    { id: 'logs', label: t('settings.sections.logs'), icon: 'Document' },
    { id: 'about', label: t('settings.sections.about'), icon: 'InfoFilled' },
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
