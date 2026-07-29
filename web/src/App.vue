<script setup lang="ts">
/**
 * 根组件：强制暗色主题（NAS 控制台定位）
 * ElConfigProvider 驱动 Element Plus 组件文案随 i18n locale 联动
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElConfigProvider } from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import en from 'element-plus/es/locale/lang/en';

document.documentElement.classList.add('dark');

const { locale } = useI18n();

/** Element Plus 组件文案 locale，跟随应用语言 */
const elLocale = computed(() => (locale.value === 'zh-CN' ? zhCn : en));
</script>

<template>
  <ElConfigProvider :locale="elLocale">
    <RouterView />
  </ElConfigProvider>
</template>
