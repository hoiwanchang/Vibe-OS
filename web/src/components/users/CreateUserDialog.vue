<script setup lang="ts">
/**
 * 创建用户对话框：提交后后端自动生成 /data/{uid}/ 目录结构
 * 支持自动分配 UID 或手动指定，支持自定义配额
 */
import { reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useUsersStore } from '@/stores/users';

const { t } = useI18n();
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
    ElMessage.warning(t('users.create.usernameInvalid'));
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
      t('users.create.success', { username: form.username, uid: form.autoUid ? '{uid}' : form.uid }),
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
    :title="t('users.create.title')"
    width="480px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form label-position="top">
      <el-form-item :label="t('users.create.username')" required>
        <el-input v-model="form.username" :placeholder="t('users.create.usernamePh')" maxlength="32" />
      </el-form-item>

      <el-form-item :label="t('users.create.uidAssign')">
        <el-radio-group v-model="form.autoUid">
          <el-radio :value="true">{{ t('users.create.autoUid') }}</el-radio>
          <el-radio :value="false">{{ t('users.create.manualUid') }}</el-radio>
        </el-radio-group>
        <el-input-number
          v-if="!form.autoUid"
          v-model="form.uid"
          :min="1000"
          :max="59999"
          style="width: 100%; margin-top: 10px"
        />
      </el-form-item>

      <el-form-item :label="t('users.create.diskQuota')">
        <el-input-number v-model="form.quotaGb" :min="1" :max="102400" style="width: 100%" />
      </el-form-item>

      <el-alert type="info" :closable="false" show-icon :title="t('users.create.autoExecTitle')">
        <template #default>
          <div class="nx-mono" style="line-height: 1.9">
            {{ t('users.create.autoExec1') }}<br />
            {{ t('users.create.autoExec2') }}<br />
            {{ t('users.create.autoExec3') }}
          </div>
        </template>
      </el-alert>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ t('users.createUser') }}
      </el-button>
    </template>
  </el-dialog>
</template>
