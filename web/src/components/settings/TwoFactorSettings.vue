<script setup lang="ts">
/**
 * 双因素认证（2FA/TOTP）设置（Phase 3）
 * 嵌入设置中心 > 安全分区
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { twoFactorApi } from '@/api';
import type { TwoFactorStatus, TwoFactorSetupResult, BackupCodesResult } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const status = ref<TwoFactorStatus | null>(null);
const setupResult = ref<TwoFactorSetupResult | null>(null);
const verifyCode = ref('');
const backupCodes = ref<BackupCodesResult | null>(null);
const showBackupCodes = ref(false);
const disablePassword = ref('');
const showDisableDialog = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    status.value = await twoFactorApi.getStatus();
  } catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
});

async function startSetup(): Promise<void> {
  try {
    setupResult.value = await twoFactorApi.setup();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function confirmVerify(): Promise<void> {
  if (!verifyCode.value || verifyCode.value.length !== 6) {
    ElMessage.warning(t('settings.twofa.invalidCode'));
    return;
  }
  try {
    await twoFactorApi.verify(verifyCode.value);
    ElMessage.success(t('settings.twofa.enabled'));
    setupResult.value = null;
    verifyCode.value = '';
    status.value = await twoFactorApi.getStatus();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function openDisable(): Promise<void> {
  disablePassword.value = '';
  showDisableDialog.value = true;
}

async function confirmDisable(): Promise<void> {
  try {
    await twoFactorApi.disable(disablePassword.value);
    ElMessage.success(t('settings.twofa.disabled'));
    showDisableDialog.value = false;
    status.value = await twoFactorApi.getStatus();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function viewBackupCodes(): Promise<void> {
  try {
    backupCodes.value = await twoFactorApi.getBackupCodes();
    showBackupCodes.value = true;
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function regenerateCodes(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('settings.twofa.regenConfirm'), t('common.warning'), { type: 'warning' });
    backupCodes.value = await twoFactorApi.regenerateBackupCodes();
    showBackupCodes.value = true;
    ElMessage.success(t('settings.twofa.regenDone'));
  } catch { /* cancelled */ }
}
</script>

<template>
  <div class="twofa-settings">
    <div class="nx-panel-title">{{ t('settings.twofa.title') }}</div>

    <!-- 状态 -->
    <div class="twofa-status-row">
      <span class="twofa-label">{{ t('common.status') }}</span>
      <span :class="status?.enabled ? 'dot dot--green' : 'dot dot--gray'" />
      <span>{{ status?.enabled ? t('settings.twofa.on') : t('settings.twofa.off') }}</span>
      <span v-if="status?.force2fa" class="twofa-force">{{ t('settings.twofa.forced') }}</span>
    </div>

    <!-- 未启用：绑定流程 -->
    <template v-if="status && !status.enabled">
      <el-button type="primary" size="small" @click="startSetup">{{ t('settings.twofa.setup') }}</el-button>

      <div v-if="setupResult" class="twofa-setup">
        <div class="twofa-qr">
          <img :src="setupResult.qrCodeDataUri" alt="TOTP QR Code" class="twofa-qr-img" />
        </div>
        <div class="twofa-secret">
          <span class="twofa-label">{{ t('settings.twofa.secret') }}</span>
          <code class="nx-mono">{{ setupResult.secret }}</code>
        </div>
        <div class="twofa-verify">
          <el-input v-model="verifyCode" :placeholder="t('settings.twofa.enterCode')" maxlength="6" class="twofa-code-input" />
          <el-button type="primary" size="small" @click="confirmVerify">{{ t('settings.twofa.verify') }}</el-button>
        </div>
      </div>
    </template>

    <!-- 已启用：管理 -->
    <template v-if="status?.enabled">
      <div class="twofa-actions">
        <el-button size="small" @click="viewBackupCodes">{{ t('settings.twofa.backupCodes') }}</el-button>
        <el-button size="small" @click="regenerateCodes">{{ t('settings.twofa.regenCodes') }}</el-button>
        <el-button v-if="!status.force2fa" size="small" type="danger" @click="openDisable">{{ t('settings.twofa.disable') }}</el-button>
      </div>
    </template>

    <!-- 备用码对话框 -->
    <el-dialog v-model="showBackupCodes" :title="t('settings.twofa.backupCodes')" width="420px">
      <el-alert type="warning" :closable="false" show-icon :title="t('settings.twofa.backupTip')" style="margin-bottom: 12px" />
      <div v-if="backupCodes" class="twofa-codes-grid">
        <code v-for="(code, i) in backupCodes.codes" :key="i" class="twofa-code nx-mono">{{ code }}</code>
      </div>
      <div v-if="backupCodes" class="twofa-codes-time nx-mono">{{ backupCodes.generatedAt }}</div>
    </el-dialog>

    <!-- 关闭 2FA 对话框 -->
    <el-dialog v-model="showDisableDialog" :title="t('settings.twofa.disable')" width="400px">
      <el-form label-position="top">
        <el-form-item :label="t('settings.twofa.confirmPassword')">
          <el-input v-model="disablePassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDisableDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="danger" @click="confirmDisable">{{ t('settings.twofa.disable') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.twofa-status-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 13px; }
.twofa-label { color: var(--nx-text-dim); }
.twofa-force { color: var(--nx-amber); font-size: 11px; border: 1px solid var(--nx-amber); padding: 1px 6px; }
.twofa-setup { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
.twofa-qr-img { width: 180px; height: 180px; image-rendering: pixelated; border: 1px solid var(--nx-border-faint); }
.twofa-secret { display: flex; align-items: center; gap: 8px; }
.twofa-verify { display: flex; gap: 8px; align-items: center; }
.twofa-code-input { width: 140px; }
.twofa-actions { display: flex; gap: 8px; margin-top: 12px; }
.twofa-codes-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.twofa-code { padding: 6px 10px; border: 1px solid var(--nx-border-faint); font-size: 14px; letter-spacing: 2px; }
.twofa-codes-time { margin-top: 12px; color: var(--nx-text-faint); font-size: 11px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot--green { background: var(--nx-green); }
.dot--gray { background: var(--nx-text-faint); }
</style>
