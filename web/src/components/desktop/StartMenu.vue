<script setup lang="ts">
/**
 * 开始菜单：左下角品牌按钮触发的弹出面板
 * - 应用搜索
 * - 按分组列出全部应用（含不在桌面的，如资源监视器）
 * - 底部电源操作（锁定/重启/关机 — 占位，需后端支持）
 * 点击菜单外部自动关闭
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { DESKTOP_APPS } from './desktop-registry';
import { useWmStore, type DesktopAppId } from '@/stores/wm';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const wm = useWmStore();
const { t } = useI18n();

/** 搜索关键字 */
const query = ref('');

/** 过滤后的应用（按分组，分组名为 i18n 键） */
const filteredGroups = computed(() => {
  const kw = query.value.trim().toLowerCase();
  const matched = DESKTOP_APPS.filter(
    (a) =>
      a.inStartMenu &&
      (!kw ||
        a.title.toLowerCase().includes(kw) ||
        t('wm.titles.' + a.title).toLowerCase().includes(kw)),
  );
  const groups = new Map<string, typeof matched>();
  for (const app of matched) {
    const g = app.group ?? 'services';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)?.push(app);
  }
  return [...groups.entries()];
});

/** 打开应用并关闭菜单 */
function launch(id: DesktopAppId): void {
  wm.open(id);
  emit('close');
}

/** 电源操作占位 */
function powerAction(action: 'lock' | 'reboot' | 'shutdown'): void {
  ElMessage.info(t('desktop.startMenu.inDevelopment', { action: t('desktop.startMenu.' + action) }));
}

/** 点击外部关闭 */
const menuRef = ref<HTMLElement | null>(null);

function onDocClick(e: MouseEvent): void {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
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
  <div ref="menuRef" class="nx-startmenu">
    <div class="nx-startmenu__search">
      <input
        v-model="query"
        class="nx-startmenu__input"
        :placeholder="t('desktop.startMenu.searchPlaceholder')"
        @keydown.esc="emit('close')"
      />
    </div>

    <div class="nx-startmenu__body">
      <div v-for="[group, apps] in filteredGroups" :key="group" class="nx-startmenu__group">
        <div class="nx-startmenu__group-label">{{ t('wm.groups.' + group) }}</div>
        <button
          v-for="app in apps"
          :key="app.id"
          class="nx-startmenu__item"
          @click="launch(app.id)"
        >
          <span class="nx-startmenu__item-icon">
            <el-icon><component :is="app.icon" /></el-icon>
          </span>
          <span class="nx-startmenu__item-title">{{ t('wm.titles.' + app.title) }}</span>
        </button>
      </div>

      <div v-if="filteredGroups.length === 0" class="nx-startmenu__empty">
        {{ t('desktop.startMenu.noMatch') }}
      </div>
    </div>

    <div class="nx-startmenu__footer">
      <button class="nx-startmenu__power" :title="t('desktop.startMenu.lock')" @click="powerAction('lock')">⏻</button>
      <button class="nx-startmenu__power" :title="t('desktop.startMenu.reboot')" @click="powerAction('reboot')">↻</button>
      <button class="nx-startmenu__power" :title="t('desktop.startMenu.shutdown')" @click="powerAction('shutdown')">⏼</button>
    </div>
  </div>
</template>
