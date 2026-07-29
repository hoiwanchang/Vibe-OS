<script setup lang="ts">
/**
 * 存储策略：硬盘休眠、SMART、回收站、写缓存
 */
import { onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';

const store = useSettingsStore();
const { settings, saving } = storeToRefs(store);

const form = reactive({
  diskSpindownMinutes: 30,
  hddStandbyEnabled: true,
  smartCheckInterval: 24,
  smartEmailAlert: true,
  trashRetentionDays: 30,
  autoDefrag: false,
  writeCache: 'enabled' as 'enabled' | 'disabled',
});

onMounted(async () => {
  if (!settings.value) await store.fetchSettings();
  const s = settings.value?.storage;
  if (s) Object.assign(form, s);
});

async function save(): Promise<void> {
  try {
    await store.saveSection('storage', { ...form });
    ElMessage.success('存储策略已保存');
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">硬盘节能</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="磁盘休眠（分钟，0 = 从不）">
        <el-input-number v-model="form.diskSpindownMinutes" :min="0" :max="600" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item label="启用 HDD 待机模式">
        <el-switch v-model="form.hddStandbyEnabled" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">SMART 监控</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="检测间隔（小时）">
        <el-input-number v-model="form.smartCheckInterval" :min="1" :max="168" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item label="SMART 异常时发送通知">
        <el-switch v-model="form.smartEmailAlert" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">回收站</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="自动清理（天，0 = 永不清理）">
        <el-input-number v-model="form.trashRetentionDays" :min="0" :max="365" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">写入缓存</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item>
        <el-radio-group v-model="form.writeCache" @change="store.markDirty()">
          <el-radio value="enabled">启用</el-radio>
          <el-radio value="disabled">禁用</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-alert type="warning" :closable="false" show-icon
        title="禁用写入缓存可降低断电数据丢失风险，但会降低写入速度" />
      <el-form-item style="margin-top: 16px">
        <el-button type="primary" :loading="saving" @click="save">保存修改</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
