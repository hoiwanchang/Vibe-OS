<script setup lang="ts">
/**
 * 部署对话框：选择应用模板 → 自动填充镜像/端口/卷挂载说明
 * 提交后由 store 自动创建 /data/naisys/{appname}/ 并绑定容器卷
 */
import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { listAppTemplates } from '@/utils/nl-parser';
import { useAppsStore } from '@/stores/apps';

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
  const tpl = templates.find((t) => t.name === name);
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
    ElMessage.warning('请填写应用名与镜像');
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
    ElMessage.success(`应用 ${form.name} 部署成功，数据目录已创建于 /data/naisys/${form.name}/`);
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
    title="部署 AI 应用"
    width="560px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form label-position="top" size="default">
      <el-form-item label="应用模板">
        <el-select
          placeholder="选择模板自动填充配置"
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

      <el-form-item label="应用名（容器名）" required>
        <el-input v-model="form.name" placeholder="如 ollama" />
      </el-form-item>

      <el-form-item label="Docker 镜像" required>
        <el-input v-model="form.image" placeholder="如 ollama/ollama:latest" />
      </el-form-item>

      <div style="display: flex; gap: 12px">
        <el-form-item label="主机端口" style="flex: 1">
          <el-input-number v-model="form.hostPort" :min="0" :max="65535" style="width: 100%" />
        </el-form-item>
        <el-form-item label="容器端口" style="flex: 1">
          <el-input-number v-model="form.containerPort" :min="0" :max="65535" style="width: 100%" />
        </el-form-item>
      </div>

      <div style="display: flex; gap: 12px">
        <el-form-item label="内存限制（如 2g）" style="flex: 1">
          <el-input v-model="form.memoryLimit" placeholder="留空为不限制" />
        </el-form-item>
        <el-form-item label="CPU 核数限制" style="flex: 1">
          <el-input-number v-model="form.cpuLimit" :min="0.5" :max="64" :step="0.5" style="width: 100%" />
        </el-form-item>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="部署时自动执行"
      >
        <template #default>
          <div class="nx-mono" style="line-height: 1.9">
            ① 创建 /data/naisys/{{ form.name || '{appname}' }}/models、data、logs<br />
            ② 绑定卷挂载：/models（只读）、/data、/logs<br />
            ③ 重启策略：unless-stopped
          </div>
        </template>
      </el-alert>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        确认部署
      </el-button>
    </template>
  </el-dialog>
</template>
