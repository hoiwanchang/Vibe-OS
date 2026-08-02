<script setup lang="ts">
/**
 * 文件预览对话框（Phase 1）
 * 按 MIME 类型分发：图片 / 文本代码 / PDF / 视频 / 音频
 * 文本类直接渲染内容；媒体类用 download URL 作为流地址
 */
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { filesApi } from '@/api';
import type { FilePreviewResult } from '@/api/types';
import { useFilesStore } from '@/stores/files';

const { t } = useI18n();
const files = useFilesStore();

const props = defineProps<{
  modelValue: boolean;
  path: string;
  filename: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
}>();

const visible = ref(props.modelValue);
watch(
  () => props.modelValue,
  (v) => {
    visible.value = v;
    if (v && props.path) void load();
  },
);
watch(visible, (v) => emit('update:modelValue', v));

const loading = ref(false);
const result = ref<FilePreviewResult | null>(null);

/** 媒体流地址（图片/视频/音频/PDF 复用 download 端点） */
function mediaUrl(): string {
  return filesApi.downloadUrl(files.uid, props.path);
}

/** 拉取预览元数据 */
async function load(): Promise<void> {
  loading.value = true;
  result.value = null;
  try {
    result.value = await filesApi.preview(files.uid, props.path);
  } catch {
    result.value = { kind: 'unsupported', mimeType: '', size: 0 };
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`${t('files.preview')} — ${filename}`"
    width="720px"
    append-to-body
    destroy-on-close
  >
    <div v-loading="loading" class="fp">
      <template v-if="result">
        <!-- 图片 -->
        <div v-if="result.kind === 'image'" class="fp__media">
          <img :src="mediaUrl()" :alt="filename" class="fp__img" />
        </div>

        <!-- 视频 -->
        <div v-else-if="result.kind === 'video'" class="fp__media">
          <video :src="mediaUrl()" controls class="fp__video" />
        </div>

        <!-- 音频 -->
        <div v-else-if="result.kind === 'audio'" class="fp__media fp__media--audio">
          <audio :src="mediaUrl()" controls class="fp__audio" />
        </div>

        <!-- PDF -->
        <div v-else-if="result.kind === 'pdf'" class="fp__pdf">
          <iframe :src="mediaUrl()" class="fp__iframe" :title="filename" />
        </div>

        <!-- 文本 / 代码 -->
        <div v-else-if="result.kind === 'text'" class="fp__text">
          <div v-if="result.truncated" class="fp__truncated nx-mono">
            {{ t('files.previewTruncated') }}
          </div>
          <pre class="fp__pre nx-mono">{{ result.content }}</pre>
        </div>

        <!-- 不支持 -->
        <div v-else class="fp__unsupported">
          {{ t('files.previewUnsupported') }}
        </div>
      </template>
    </div>
  </el-dialog>
</template>

<style scoped>
.fp {
  min-height: 200px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}
.fp__media {
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
}
.fp__media--audio {
  padding: 40px 0;
}
.fp__img {
  max-width: 100%;
  max-height: 65vh;
  object-fit: contain;
}
.fp__video {
  max-width: 100%;
  max-height: 65vh;
}
.fp__audio {
  width: 100%;
}
.fp__pdf {
  height: 65vh;
}
.fp__iframe {
  width: 100%;
  height: 100%;
  border: none;
}
.fp__text {
  overflow: auto;
  max-height: 65vh;
}
.fp__truncated {
  padding: 6px 10px;
  background: rgba(245, 166, 35, 0.12);
  color: var(--nx-accent, #f5a623);
  font-size: 12px;
  border-bottom: 1px solid var(--nx-border, #2a2a2a);
}
.fp__pre {
  margin: 0;
  padding: 12px;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--nx-text, #e0e0e0);
}
.fp__unsupported {
  padding: 60px 0;
  text-align: center;
  color: var(--nx-text-dim, #666);
}
</style>
