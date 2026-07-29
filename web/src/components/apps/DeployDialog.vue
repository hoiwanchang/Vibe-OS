<script setup lang="ts">
/**
 * 部署对话框：选择应用模板 → 自动填充镜像/端口/卷挂载说明
 * 提交后由 store 自动创建 /data/naisys/{appname}/ 并绑定容器卷
 */
import { reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { listAppTemplates } from '@/utils/nl-parser';
import { useAppsStore } from '@/stores/apps';

const { t } = useI18n();

const visible = defineModel<boolean>('visible', { default: false });

const store = useAppsStore();
const templates = listAppTemplates();

const form = reactive({
  name: '',
  image: '',
  hostPort: 0,
  containerPort: 0,
  memoryLimit: '',
  cpuLimit: undefined as number | undefined,
});

const submitting = ref(false);

/** 选择模板后自动填充 */
function applyTemplate(name: string): void {
  const tpl = templates.find((item) => item.name === name);
  if (!tpl) return;
  form.name = tpl.name;
  form.image = tpl.image;
  form.hostPort = tpl.port;
  form.containerPort = tpl.port;
}

watch(visible, (v) => {
  if (v) {
    form.name = '';
    form.image = '';
    form.hostPort = 0;
    form.containerPort = 0;
    form.memoryLimit = '';
    form.cpuLimit = undefined;
  }
});

async function submit(): Promise<void> {
  if (!form.name || !form.image) {
    ElMessage.warning(t('deployDialog.fillRequired'));
    return;
  }
  submitting.value = true;
  try {
    await store.deployApp({
      name: form.name,
      image: form.image,
      ports:
        form.hostPort > 0 && form.containerPort > 0
          ? [{ host: form.hostPort, container: form.containerPort }]
          : undefined,
      memoryLimit: form.memoryLimit || undefined,
      cpuLimit: form.cpuLimit,
    });
    ElMessage.success(t('deployDialog.success', { name: form.name }));
    visible.value = false;
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('deployDialog.title')"
    width="560px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form label-position="top" size="default">
      <el-form-item :label="t('deployDialog.template')">
        <el-select
          :placeholder="t('deployDialog.templatePh')"
          style="width: 100%"
          @change="applyTemplate"
        >
          <el-option
            v-for="tpl in templates"
            :key="tpl.name"
            :label="`${tpl.label}（${tpl.name}）`"
            :value="tpl.name"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="t('deployDialog.appName')" required>
        <el-input v-model="form.name" :placeholder="t('deployDialog.appNamePh')" />
      </el-form-item>

      <el-form-item :label="t('deployDialog.dockerImage')" required>
        <el-input v-model="form.image" :placeholder="t('deployDialog.imagePh')" />
      </el-form-item>

      <div style="display: flex; gap: 12px">
        <el-form-item :label="t('deployDialog.hostPort')" style="flex: 1">
          <el-input-number v-model="form.hostPort" :min="0" :max="65535" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('deployDialog.containerPort')" style="flex: 1">
          <el-input-number v-model="form.containerPort" :min="0" :max="65535" style="width: 100%" />
        </el-form-item>
      </div>

      <div style="display: flex; gap: 12px">
        <el-form-item :label="t('deployDialog.memoryLimit')" style="flex: 1">
          <el-input v-model="form.memoryLimit" :placeholder="t('deployDialog.memoryPh')" />
        </el-form-item>
        <el-form-item :label="t('deployDialog.cpuLimit')" style="flex: 1">
          <el-input-number v-model="form.cpuLimit" :min="0.5" :max="64" :step="0.5" style="width: 100%" />
        </el-form-item>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        :title="t('deployDialog.autoExecTitle')"
      >
        <template #default>
          <div class="nx-mono" style="line-height: 1.9">
            {{ t('deployDialog.autoExec1', { app: form.name || '{appname}' }) }}<br />
            {{ t('deployDialog.autoExec2') }}<br />
            {{ t('deployDialog.autoExec3') }}
          </div>
        </template>
      </el-alert>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ t('common.confirmDeploy') }}
      </el-button>
    </template>
  </el-dialog>
</template>
