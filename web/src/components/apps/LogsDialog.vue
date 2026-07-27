<script setup lang="ts">
/**
 * 容器日志对话框：终端风格展示 stdout/stderr
 */
import { ref, watch } from 'vue';
import { containerApi } from '@/api';
import type { ContainerLogResult } from '@/api/types';

const props = defineProps<{ name: string | null }>();
const visible = defineModel<boolean>('visible', { default: false });

const logs = ref<ContainerLogResult | null>(null);
const loading = ref(false);

watch(visible, async (v) => {
  if (v && props.name) {
    loading.value = true;
    logs.value = null;
    try {
      logs.value = await containerApi.logs(props.name, 300);
    } finally {
      loading.value = false;
    }
  }
});
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`容器日志 — ${name ?? ''}`"
    width="760px"
    destroy-on-close
  >
    <div v-loading="loading" class="logs-wrap">
      <div v-if="logs" class="nx-terminal">
        <template v-if="logs.stdout">{{ logs.stdout }}</template>
        <template v-if="logs.stderr">
          <span style="color: var(--nx-red)">{{ logs.stderr }}</span>
        </template>
        <span v-if="!logs.stdout && !logs.stderr" style="color: var(--nx-text-faint)">
          （无日志输出）
        </span>
      </div>
      <el-empty v-else-if="!loading" description="暂无日志" :image-size="60" />
    </div>
  </el-dialog>
</template>

<style scoped>
.logs-wrap {
  min-height: 200px;
}
</style>
