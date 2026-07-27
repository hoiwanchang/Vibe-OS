<script setup lang="ts">
/**
 * 创建用户对话框：提交后后端自动生成 /data/{uid}/ 目录结构
 * 支持自动分配 UID 或手动指定，支持自定义配额
 */
import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useUsersStore } from '@/stores/users';

const visible = defineModel<boolean>('visible', { default: false });

const store = useUsersStore();

const form = reactive({
  username: '',
  autoUid: true,
  uid: 1000,
  quotaGb: 100,
});

const submitting = ref(false);

watch(visible, (v) => {
  if (v) {
    form.username = '';
    form.autoUid = true;
    form.uid = 1000;
    form.quotaGb = 100;
  }
});

async function submit(): Promise<void> {
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(form.username)) {
    ElMessage.warning('用户名须以小写字母或下划线开头，仅含小写字母、数字、下划线、连字符');
    return;
  }
  submitting.value = true;
  try {
    await store.createUser({
      username: form.username,
      uid: form.autoUid ? undefined : form.uid,
      quotaBytes: String(Math.max(1, form.quotaGb) * 1024 ** 3),
    });
    ElMessage.success(
      `用户 ${form.username} 创建成功，数据目录 /data/${form.autoUid ? '{uid}' : form.uid}/ 已生成`,
    );
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
    title="创建用户"
    width="480px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form label-position="top">
      <el-form-item label="用户名" required>
        <el-input v-model="form.username" placeholder="如 kane（小写字母开头）" maxlength="32" />
      </el-form-item>

      <el-form-item label="UID 分配">
        <el-radio-group v-model="form.autoUid">
          <el-radio :value="true">自动分配</el-radio>
          <el-radio :value="false">手动指定</el-radio>
        </el-radio-group>
        <el-input-number
          v-if="!form.autoUid"
          v-model="form.uid"
          :min="1000"
          :max="59999"
          style="width: 100%; margin-top: 10px"
        />
      </el-form-item>

      <el-form-item label="磁盘配额（GB）">
        <el-input-number v-model="form.quotaGb" :min="1" :max="102400" style="width: 100%" />
      </el-form-item>

      <el-alert type="info" :closable="false" show-icon title="创建时自动执行">
        <template #default>
          <div class="nx-mono" style="line-height: 1.9">
            ① 生成目录 /data/{uid}/files、config、cache<br />
            ② 用户目录权限 0700（跨用户隔离）<br />
            ③ 写入磁盘配额（文件系统支持时生效）
          </div>
        </template>
      </el-alert>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        创建用户
      </el-button>
    </template>
  </el-dialog>
</template>
