<script setup lang="ts">
/**
 * 自然语言指令台：输入中文/英文指令 → 前端解析为结构化参数
 * → 用户确认摘要 → 调用后端 API 完成部署变更
 * 示例："部署 ollama，端口 11434，内存限制 4g，总是重启"
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useAppsStore } from '@/stores/apps';
import type { ParseResult } from '@/utils/nl-parser';

const { t, tm } = useI18n();

const store = useAppsStore();

const input = ref('');
const result = ref<ParseResult | null>(null);
const submitting = ref(false);

const canConfirm = computed(
  () =>
    result.value !== null &&
    result.value.warnings.length === 0 &&
    (result.value.params.name !== undefined ||
      result.value.params.image !== undefined),
);

/** 解析指令（实时预览） */
function parse(): void {
  if (!input.value.trim()) {
    result.value = null;
    return;
  }
  result.value = store.parseNaturalCommand(input.value);
}

/** 确认后调用后端 API 执行部署 */
async function confirm(): Promise<void> {
  if (!result.value) return;
  const params = result.value.params;
  if (!params.name || !params.image) {
    ElMessage.warning(t('nl.commandBar.missingParams'));
    return;
  }
  submitting.value = true;
  try {
    await store.deployApp({
      name: params.name,
      image: params.image,
      ports: params.ports,
      env: params.env,
      memoryLimit: params.memoryLimit,
      cpuLimit: params.cpuLimit,
      restartPolicy: params.restartPolicy ?? 'unless-stopped',
    });
    ElMessage.success(t('nl.commandBar.executed', { name: params.name }));
    input.value = '';
    result.value = null;
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    submitting.value = false;
  }
}

const examples = computed(() => tm('nl.commandBar.examples') as string[]);
</script>

<template>
  <div class="nx-panel nl-panel">
    <div class="nx-panel-title">
      <el-icon><MagicStick /></el-icon>{{ t('nl.commandBar.title') }}
      <span class="nl-hint">{{ t('nl.commandBar.hint') }}</span>
    </div>

    <div class="nl-input-row">
      <el-input
        v-model="input"
        size="large"
        :placeholder="t('nl.commandBar.placeholder')"
        clearable
        @input="parse"
        @keyup.enter="parse"
      >
        <template #prefix>
          <el-icon><ChatDotRound /></el-icon>
        </template>
      </el-input>
      <el-button type="primary" size="large" @click="parse">
        {{ t('nl.commandBar.parse') }}
      </el-button>
    </div>

    <div class="nl-examples">
      <el-tag
        v-for="ex in examples"
        :key="ex"
        size="small"
        effect="plain"
        class="nl-example"
        @click="input = ex; parse()"
      >
        {{ ex }}
      </el-tag>
    </div>

    <!-- 解析结果预览 -->
    <div v-if="result" class="nl-result">
      <div v-if="result.warnings.length > 0" class="nl-warnings">
        <div v-for="w in result.warnings" :key="w" class="nl-warning">
          <el-icon><WarningFilled /></el-icon>{{ w }}
        </div>
      </div>
      <template v-else>
        <div class="nl-summary">
          <div v-for="line in result.summary" :key="line" class="nl-summary-line">
            <el-icon class="nl-check"><CircleCheck /></el-icon>{{ line }}
          </div>
        </div>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!canConfirm"
          @click="confirm"
        >
          {{ t('nl.commandBar.confirmExec') }}
        </el-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.nl-panel {
  border-color: var(--nx-primary-dim);
  background: linear-gradient(160deg, rgba(57, 213, 255, 0.05) 0%, var(--nx-surface) 40%);
}

.nl-hint {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--nx-text-faint);
  margin-left: 6px;
}

.nl-input-row {
  display: flex;
  gap: 10px;
}

.nl-examples {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.nl-example {
  cursor: pointer;
  transition: transform 0.15s ease;
}

.nl-example:hover {
  transform: translateY(-1px);
}

.nl-result {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--nx-border);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.nl-summary {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1;
}

.nl-summary-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--nx-text-dim);
  animation: nl-in 0.25s ease both;
}

.nl-check {
  color: var(--nx-teal);
}

.nl-warnings {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nl-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--nx-amber);
  font-size: 13px;
}

@keyframes nl-in {
  from { opacity: 0; transform: translateX(-6px); }
  to { opacity: 1; transform: translateX(0); }
}
</style>
