<script setup lang="ts">
/**
 * 系统设置中心 — 左导航 + 右内容
 * 重构自原版双 tab 布局，覆盖 11 个设置分区
 * 导航使用自定义列表（非 el-menu），避免 Element Plus 主题冲突
 */
import { computed } from 'vue';
import { ElMessageBox } from 'element-plus';
import {
  Setting, User, Connection, Operation, Lock, Coin,
  Lightning, Bell, Upload, Document, InfoFilled, MagicStick,
} from '@element-plus/icons-vue';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

import GeneralSettings from '@/components/settings/GeneralSettings.vue';
import UserSettings from '@/components/settings/UserSettings.vue';
import NetworkSettings from '@/components/settings/NetworkSettings.vue';
import ServiceSettings from '@/components/settings/ServiceSettings.vue';
import SecuritySettings from '@/components/settings/SecuritySettings.vue';
import StorageSettings from '@/components/settings/StorageSettings.vue';
import PowerSettings from '@/components/settings/PowerSettings.vue';
import NotificationSettings from '@/components/settings/NotificationSettings.vue';
import UpdateSettings from '@/components/settings/UpdateSettings.vue';
import LogViewer from '@/components/settings/LogViewer.vue';
import AboutPanel from '@/components/settings/AboutPanel.vue';
import LlmSettings from '@/components/settings/LlmSettings.vue';

const store = useSettingsStore();
const { activeSection, sectionList, dirty } = storeToRefs(store);

const iconMap: Record<string, typeof Setting> = {
  Setting, User, Connection, Operation, Lock, Coin,
  Lightning, Bell, Upload, Document, InfoFilled, MagicStick,
};

const componentMap: Record<string, typeof GeneralSettings> = {
  general: GeneralSettings,
  users: UserSettings,
  network: NetworkSettings,
  services: ServiceSettings,
  security: SecuritySettings,
  storage: StorageSettings,
  power: PowerSettings,
  notification: NotificationSettings,
  llm: LlmSettings,
  update: UpdateSettings,
  logs: LogViewer,
  about: AboutPanel,
};

const currentComponent = computed(() => componentMap[activeSection.value] ?? GeneralSettings);

/** 切换 section 时，若有未保存修改则提示 */
async function switchSection(id: string): Promise<void> {
  if (dirty.value && activeSection.value !== id) {
    try {
      await ElMessageBox.confirm(
        '当前页面有未保存的修改，切换将丢失更改。',
        '未保存修改',
        { confirmButtonText: '放弃修改', cancelButtonText: '留在当前页', type: 'warning' },
      );
      dirty.value = false;
    } catch {
      return;
    }
  }
  activeSection.value = id;
}
</script>

<template>
  <div class="settings-center">
    <nav class="settings-nav">
      <button
        v-for="s in sectionList"
        :key="s.id"
        class="settings-nav__item"
        :class="{ 'settings-nav__item--active': activeSection === s.id }"
        @click="switchSection(s.id)"
      >
        <el-icon :size="16"><component :is="iconMap[s.icon]" /></el-icon>
        <span>{{ s.label }}</span>
      </button>
    </nav>

    <div class="settings-content">
      <component :is="currentComponent" />
    </div>
  </div>
</template>

<style scoped>
.settings-center {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.settings-nav {
  width: 160px;
  min-width: 160px;
  border-right: 1px solid var(--nx-border-faint);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}

.settings-nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--nx-text-dim);
  font-size: 13px;
  font-family: var(--nx-font-body);
  cursor: pointer;
  text-align: left;
  transition: color 0.15s, background 0.15s;
}

.settings-nav__item:hover {
  color: var(--nx-text);
  background: var(--nx-surface-hover);
}

.settings-nav__item--active,
.settings-nav__item--active:hover {
  color: var(--nx-amber);
  background: var(--nx-amber-dim);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.settings-section {
  animation: fade-up 0.3s ease both;
}

.settings-form {
  max-width: 480px;
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
