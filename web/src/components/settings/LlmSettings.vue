<script setup lang="ts">
/**
 * LLM 配置：AI 助手 API 端点、密钥、模型参数
 * 用于「自定义部署」中的 Git 仓库智能分析
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { appsApi } from '@/api';
import type { LlmConfig } from '@/api/types';

const { t } = useI18n();

const form = ref<LlmConfig>({
  endpoint: '',
  apiKey: '',
  model: '',
  maxTokens: 2048,
  temperature: 0.3,
});
const configured = ref(false);
const saving = ref(false);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await appsApi.llmConfig();
    configured.value = res.configured;
    if (res.config) {
      form.value = { ...res.config };
    }
  } catch {
    // 静默
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  if (!form.value.endpoint || !form.value.model) {
    ElMessage.warning(t('settings.llm.fillRequired'));
    return;
  }
  saving.value = true;
  try {
    await appsApi.setLlmConfig(form.value);
    configured.value = true;
    ElMessage.success(t('settings.llm.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="settings-section" v-loading="loading">
    <h3 class="section-title">{{ t('settings.llm.title') }}</h3>
    <p class="section-hint">
      {{ t('settings.llm.desc1') }}
      {{ t('settings.llm.desc2') }}
    </p>

    <el-form label-width="100px" label-position="left" class="settings-form">
      <el-form-item :label="t('settings.llm.endpoint')" required>
        <el-input
          v-model="form.endpoint"
          :placeholder="t('settings.llm.endpointPh')"
        />
      </el-form-item>
      <el-form-item :label="t('settings.llm.apiKey')" required>
        <el-input
          v-model="form.apiKey"
          type="password"
          show-password
          :placeholder="t('settings.llm.apiKeyPh')"
        />
      </el-form-item>
      <el-form-item :label="t('settings.llm.model')" required>
        <el-input
          v-model="form.model"
          placeholder="qwen2.5:7b / gpt-4o / llama3.1:8b"
        />
      </el-form-item>
      <el-form-item :label="t('settings.llm.maxTokens')">
        <el-input-number
          v-model="form.maxTokens"
          :min="256"
          :max="32768"
          :step="256"
        />
      </el-form-item>
      <el-form-item :label="t('settings.llm.temperature')">
        <el-slider
          v-model="form.temperature"
          :min="0"
          :max="2"
          :step="0.1"
          show-input
          class="temp-slider"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">
          {{ t('settings.llm.saveConfig') }}
        </el-button>
        <el-tag v-if="configured" type="success" effect="dark" size="small" style="margin-left: 12px">
          {{ t('settings.llm.configured') }}
        </el-tag>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.section-title {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--nx-text, #e0e0e0);
}
.section-hint {
  font-size: 12px;
  color: var(--nx-text-faint, #888);
  margin: 0 0 20px;
  line-height: 1.6;
}
.temp-slider {
  max-width: 280px;
}
</style>
