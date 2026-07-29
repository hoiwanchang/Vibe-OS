<script setup lang="ts">
/**
 * 告警中心面板：任务栏告警指示器触发的弹出层
 * 列出全部活动告警（critical/warning），支持单条确认
 * 点击面板外部自动关闭
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useSystemStore } from '@/stores/system';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const system = useSystemStore();
const { t } = useI18n();
const { activeAlerts } = storeToRefs(system);

const panelRef = ref<HTMLElement | null>(null);

function onDocClick(e: MouseEvent): void {
  if (panelRef.value && !panelRef.value.contains(e.target as Node)) {
    emit('close');
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocClick);
});
</script>

<template>
  <div ref="panelRef" class="nx-alerts-panel">
    <div class="nx-alerts-panel__header">
      <span>{{ t('desktop.alerts.title') }}</span>
      <span class="nx-alerts-panel__count">{{ activeAlerts.length }}</span>
    </div>

    <div class="nx-alerts-panel__body">
      <div v-if="activeAlerts.length === 0" class="nx-alerts-panel__empty">
        {{ t('desktop.alerts.allClear') }}
      </div>

      <div
        v-for="alert in activeAlerts"
        :key="alert.id"
        class="nx-alerts-panel__item"
        :class="`nx-alerts-panel__item--${alert.severity}`"
      >
        <div class="nx-alerts-panel__item-title">{{ alert.title }}</div>
        <div class="nx-alerts-panel__item-detail">{{ alert.detail }}</div>
        <button
          class="nx-alerts-panel__ack"
          @click="system.acknowledgeAlert(alert.id)"
        >
          {{ t('desktop.alerts.ack') }}
        </button>
      </div>
    </div>
  </div>
</template>
