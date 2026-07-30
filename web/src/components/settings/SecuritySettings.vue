<script setup lang="ts">
/**
 * 安全设置：HTTPS、SSL 证书管理、SSH、登录保护、IP 黑白名单、防火墙
 */
import { onMounted, reactive, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import { settingsApi } from '@/api';
import type { CertStatus, SshKeysResult, SshPublicKey, GeneratedSshKey } from '@/api/types';

const { t } = useI18n();
const store = useSettingsStore();
const { settings, saving } = storeToRefs(store);

const form = reactive({
  httpsEnabled: false,
  httpsPort: 443,
  sshEnabled: true,
  sshPort: 22,
  sshPasswordAuth: false,
  maxLoginAttempts: 5,
  lockoutMinutes: 30,
  ipBlacklist: '',
  ipWhitelist: '',
  firewallEnabled: true,
  autoSecurityUpdates: true,
});

/* ---------- SSL 证书管理 ---------- */

const certStatus = ref<CertStatus | null>(null);
const certLoading = ref(false);

const certState = computed<'installed' | 'invalid' | 'missing'>(() => {
  const st = certStatus.value;
  if (!st || !st.installed) return 'missing';
  if (st.info) return 'installed';
  return 'invalid';
});

const genForm = reactive({
  commonName: '',
  sans: '',
  days: 825,
  keySize: 2048 as 2048 | 4096,
});
const genDialogVisible = ref(false);
const genSubmitting = ref(false);

const importForm = reactive({ certPem: '', keyPem: '' });
const importDialogVisible = ref(false);
const importSubmitting = ref(false);

async function loadCertStatus(): Promise<void> {
  certLoading.value = true;
  try {
    certStatus.value = await settingsApi.certStatus();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    certLoading.value = false;
  }
}

function openGenerate(): void {
  // 预填 Tailscale 常用 SAN 提示
  genForm.commonName = '';
  genForm.sans = '';
  genForm.days = 825;
  genForm.keySize = 2048;
  genDialogVisible.value = true;
}

async function submitGenerate(): Promise<void> {
  const sans = genForm.sans
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const cn = genForm.commonName.trim() || sans[0] || '';
  if (!cn) {
    ElMessage.warning(t('settings.security.cert.commonName'));
    return;
  }
  genSubmitting.value = true;
  try {
    await settingsApi.generateCert({
      commonName: cn,
      sans,
      days: genForm.days,
      keySize: genForm.keySize,
    });
    ElMessage.success(t('settings.security.cert.generated'));
    genDialogVisible.value = false;
    await loadCertStatus();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    genSubmitting.value = false;
  }
}

function openImport(): void {
  importForm.certPem = '';
  importForm.keyPem = '';
  importDialogVisible.value = true;
}

async function submitImport(): Promise<void> {
  if (!importForm.certPem.trim() || !importForm.keyPem.trim()) {
    ElMessage.warning(t('settings.security.cert.importTitle'));
    return;
  }
  importSubmitting.value = true;
  try {
    await settingsApi.importCert({
      certPem: importForm.certPem,
      keyPem: importForm.keyPem,
    });
    ElMessage.success(t('settings.security.cert.imported'));
    importDialogVisible.value = false;
    await loadCertStatus();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    importSubmitting.value = false;
  }
}

async function removeCert(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('settings.security.cert.removeConfirm'),
      t('settings.security.cert.removeTitle'),
      { type: 'warning' },
    );
  } catch {
    return; // 用户取消
  }
  try {
    await settingsApi.deleteCert();
    ElMessage.success(t('settings.security.cert.removed'));
    await loadCertStatus();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/* ---------- SSH 密钥管理 ---------- */

const sshKeys = ref<SshKeysResult | null>(null);
const sshKeysLoading = ref(false);

const importKeyForm = reactive({ publicKey: '' });
const importKeyDialogVisible = ref(false);
const importKeySubmitting = ref(false);

const genKeyForm = reactive({
  type: 'ed25519' as 'ed25519' | 'rsa',
  bits: 4096 as 2048 | 4096,
  comment: '',
});
const genKeyDialogVisible = ref(false);
const genKeySubmitting = ref(false);

/** 生成结果（私钥仅展示一次） */
const generatedKey = ref<GeneratedSshKey | null>(null);
const generatedKeyDialogVisible = ref(false);

async function loadSshKeys(): Promise<void> {
  sshKeysLoading.value = true;
  try {
    sshKeys.value = await settingsApi.listSshKeys();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    sshKeysLoading.value = false;
  }
}

function openImportKey(): void {
  importKeyForm.publicKey = '';
  importKeyDialogVisible.value = true;
}

async function submitImportKey(): Promise<void> {
  if (!importKeyForm.publicKey.trim()) {
    ElMessage.warning(t('settings.security.sshKeys.importEmpty'));
    return;
  }
  importKeySubmitting.value = true;
  try {
    await settingsApi.importSshKey({ publicKey: importKeyForm.publicKey.trim() });
    ElMessage.success(t('settings.security.sshKeys.imported'));
    importKeyDialogVisible.value = false;
    await loadSshKeys();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    importKeySubmitting.value = false;
  }
}

function openGenerateKey(): void {
  genKeyForm.type = 'ed25519';
  genKeyForm.bits = 4096;
  genKeyForm.comment = '';
  genKeyDialogVisible.value = true;
}

async function submitGenerateKey(): Promise<void> {
  genKeySubmitting.value = true;
  try {
    const key = await settingsApi.generateSshKey({
      type: genKeyForm.type,
      bits: genKeyForm.type === 'rsa' ? genKeyForm.bits : undefined,
      comment: genKeyForm.comment.trim() || undefined,
    });
    generatedKey.value = key;
    genKeyDialogVisible.value = false;
    generatedKeyDialogVisible.value = true;
    await loadSshKeys();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  } finally {
    genKeySubmitting.value = false;
  }
}

async function removeSshKey(key: SshPublicKey): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('settings.security.sshKeys.removeConfirm', { comment: key.comment || key.fingerprint }),
      t('settings.security.sshKeys.removeTitle'),
      { type: 'warning' },
    );
  } catch {
    return; // 用户取消
  }
  try {
    await settingsApi.deleteSshKey(key.fingerprint);
    ElMessage.success(t('settings.security.sshKeys.removed'));
    await loadSshKeys();
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success(t('settings.security.sshKeys.copied'));
  } catch {
    ElMessage.error(t('settings.security.sshKeys.copyFailed'));
  }
}

onMounted(async () => {
  if (!settings.value) await store.fetchSettings();
  const s = settings.value?.security;
  if (s) {
    form.httpsEnabled = s.httpsEnabled;
    form.httpsPort = s.httpsPort;
    form.sshEnabled = s.sshEnabled;
    form.sshPort = s.sshPort;
    form.sshPasswordAuth = s.sshPasswordAuth;
    form.maxLoginAttempts = s.maxLoginAttempts;
    form.lockoutMinutes = s.lockoutMinutes;
    form.ipBlacklist = s.ipBlacklist.join('\n');
    form.ipWhitelist = s.ipWhitelist.join('\n');
    form.firewallEnabled = s.firewallEnabled;
    form.autoSecurityUpdates = s.autoSecurityUpdates;
  }
  await loadCertStatus();
  await loadSshKeys();
});

async function save(): Promise<void> {
  try {
    await store.saveSection('security', {
      ...form,
      ipBlacklist: form.ipBlacklist.split('\n').map(s => s.trim()).filter(Boolean),
      ipWhitelist: form.ipWhitelist.split('\n').map(s => s.trim()).filter(Boolean),
    });
    ElMessage.success(t('settings.security.saved'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel settings-section">
    <div class="nx-panel-title">HTTPS / SSL</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.security.enableHttps')">
        <el-switch v-model="form.httpsEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item v-if="form.httpsEnabled" :label="t('settings.security.httpsPort')">
        <el-input-number v-model="form.httpsPort" :min="1" :max="65535" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <!-- SSL 证书管理 -->
    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.security.cert.section') }}</div>
    <div class="cert-hint">{{ t('settings.security.cert.hint') }}</div>
    <div v-loading="certLoading" class="cert-card">
      <div class="cert-status-row">
        <el-tag v-if="certState === 'installed'" :type="certStatus?.info?.isExpired ? 'danger' : 'success'" effect="dark">
          {{ t('settings.security.cert.statusInstalled') }}
        </el-tag>
        <el-tag v-else-if="certState === 'invalid'" type="danger" effect="dark">
          {{ t('settings.security.cert.statusInvalid') }}
        </el-tag>
        <el-tag v-else type="info" effect="dark">
          {{ t('settings.security.cert.statusMissing') }}
        </el-tag>
        <template v-if="certStatus?.info">
          <el-tag v-if="certStatus.info.isSelfSigned" size="small" type="warning">{{ t('settings.security.cert.selfSigned') }}</el-tag>
          <el-tag v-if="certStatus.info.isExpired" size="small" type="danger">{{ t('settings.security.cert.expired') }}</el-tag>
          <el-tag v-else size="small" type="info">{{ t('settings.security.cert.expiresIn', { days: certStatus.info.daysRemaining }) }}</el-tag>
        </template>
      </div>

      <div v-if="certStatus?.info" class="cert-detail">
        <div class="cert-detail-item"><span class="cert-label">{{ t('settings.security.cert.subject') }}</span><span class="cert-value">{{ certStatus.info.subject }}</span></div>
        <div class="cert-detail-item"><span class="cert-label">{{ t('settings.security.cert.issuer') }}</span><span class="cert-value">{{ certStatus.info.issuer }}</span></div>
        <div class="cert-detail-item"><span class="cert-label">{{ t('settings.security.cert.validFrom') }}</span><span class="cert-value">{{ fmtDate(certStatus.info.validFrom) }}</span></div>
        <div class="cert-detail-item"><span class="cert-label">{{ t('settings.security.cert.validTo') }}</span><span class="cert-value">{{ fmtDate(certStatus.info.validTo) }}</span></div>
        <div class="cert-detail-item"><span class="cert-label">{{ t('settings.security.cert.serial') }}</span><span class="cert-value nx-mono">{{ certStatus.info.serialNumber }}</span></div>
        <div class="cert-detail-item"><span class="cert-label">{{ t('settings.security.cert.fingerprint') }}</span><span class="cert-value nx-mono cert-fp">{{ certStatus.info.fingerprint }}</span></div>
        <div v-if="certStatus.info.sans.length" class="cert-detail-item"><span class="cert-label">{{ t('settings.security.cert.sans') }}</span><span class="cert-value nx-mono">{{ certStatus.info.sans.join(', ') }}</span></div>
        <div class="cert-detail-item"><span class="cert-label">{{ t('settings.security.cert.certPath') }}</span><span class="cert-value nx-mono">{{ certStatus.certPath }}</span></div>
      </div>
      <div v-else-if="certStatus?.error" class="cert-error nx-mono">{{ certStatus.error }}</div>

      <div class="cert-actions">
        <el-button type="primary" @click="openGenerate">{{ t('settings.security.cert.generate') }}</el-button>
        <el-button @click="openImport">{{ t('settings.security.cert.import') }}</el-button>
        <el-button v-if="certStatus?.installed" type="danger" plain @click="removeCert">{{ t('settings.security.cert.remove') }}</el-button>
      </div>
    </div>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.security.sshSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.security.enableSsh')">
        <el-switch v-model="form.sshEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item v-if="form.sshEnabled" :label="t('settings.security.sshPort')">
        <el-input-number v-model="form.sshPort" :min="1" :max="65535" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.security.allowPassword')">
        <el-switch v-model="form.sshPasswordAuth" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <!-- SSH 公钥管理 -->
    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.security.sshKeys.section') }}</div>
    <div class="cert-hint">{{ t('settings.security.sshKeys.hint') }}</div>
    <div v-loading="sshKeysLoading" class="cert-card">
      <div v-if="sshKeys" class="ssh-keys-meta nx-mono">
        {{ t('settings.security.sshKeys.targetUser') }}: {{ sshKeys.targetUser }} · {{ sshKeys.keysFile }}
      </div>
      <el-table
        v-if="sshKeys && sshKeys.keys.length"
        :data="sshKeys.keys"
        size="small"
        class="ssh-keys-table"
      >
        <el-table-column prop="type" :label="t('settings.security.sshKeys.colType')" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.valid ? 'success' : 'danger'" effect="dark">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="bits" :label="t('settings.security.sshKeys.colBits')" width="80" />
        <el-table-column prop="comment" :label="t('settings.security.sshKeys.colComment')" min-width="140" show-overflow-tooltip />
        <el-table-column prop="fingerprint" :label="t('settings.security.sshKeys.colFingerprint')" min-width="200">
          <template #default="{ row }">
            <span class="nx-mono ssh-fp">{{ row.fingerprint }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('settings.security.sshKeys.colActions')" width="100" align="right">
          <template #default="{ row }">
            <el-button v-if="row.valid" type="danger" size="small" plain @click="removeSshKey(row)">
              {{ t('settings.security.sshKeys.remove') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-else-if="sshKeys" class="ssh-keys-empty">{{ t('settings.security.sshKeys.empty') }}</div>

      <div class="cert-actions">
        <el-button type="primary" @click="openImportKey">{{ t('settings.security.sshKeys.import') }}</el-button>
        <el-button @click="openGenerateKey">{{ t('settings.security.sshKeys.generate') }}</el-button>
      </div>
    </div>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.security.loginSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.security.maxAttempts')">
        <el-input-number v-model="form.maxLoginAttempts" :min="1" :max="20" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.security.lockoutMinutes')">
        <el-input-number v-model="form.lockoutMinutes" :min="1" :max="1440" @change="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.security.ipSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.security.blacklist')">
        <el-input v-model="form.ipBlacklist" type="textarea" :rows="3" @input="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.security.whitelist')">
        <el-input v-model="form.ipWhitelist" type="textarea" :rows="3" @input="store.markDirty()" />
      </el-form-item>
    </el-form>

    <div class="nx-panel-title" style="margin-top: 20px">{{ t('settings.security.firewallSection') }}</div>
    <el-form label-position="top" class="settings-form">
      <el-form-item :label="t('settings.security.enableFirewall')">
        <el-switch v-model="form.firewallEnabled" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item :label="t('settings.security.autoUpdate')">
        <el-switch v-model="form.autoSecurityUpdates" @change="store.markDirty()" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.saveChanges') }}</el-button>
      </el-form-item>
    </el-form>

    <!-- 生成自签证书对话框 -->
    <el-dialog v-model="genDialogVisible" :title="t('settings.security.cert.generateTitle')" width="520px">
      <el-form label-position="top" class="settings-form">
        <el-form-item :label="t('settings.security.cert.commonName')">
          <el-input v-model="genForm.commonName" :placeholder="t('settings.security.cert.commonNamePh')" />
        </el-form-item>
        <el-form-item :label="t('settings.security.cert.sansLabel')">
          <el-input v-model="genForm.sans" type="textarea" :rows="3" :placeholder="t('settings.security.cert.sansPh')" />
        </el-form-item>
        <el-form-item :label="t('settings.security.cert.days')">
          <el-input-number v-model="genForm.days" :min="1" :max="3650" />
        </el-form-item>
        <el-form-item :label="t('settings.security.cert.keySize')">
          <el-select v-model="genForm.keySize" style="width: 160px">
            <el-option :value="2048" label="RSA 2048" />
            <el-option :value="4096" label="RSA 4096" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="genSubmitting" @click="submitGenerate">{{ t('settings.security.cert.generateBtn') }}</el-button>
      </template>
    </el-dialog>

    <!-- 导入证书对话框 -->
    <el-dialog v-model="importDialogVisible" :title="t('settings.security.cert.importTitle')" width="600px">
      <el-form label-position="top" class="settings-form">
        <el-form-item :label="t('settings.security.cert.certPem')">
          <el-input v-model="importForm.certPem" type="textarea" :rows="6" class="nx-mono" :placeholder="t('settings.security.cert.certPemPh')" />
        </el-form-item>
        <el-form-item :label="t('settings.security.cert.keyPem')">
          <el-input v-model="importForm.keyPem" type="textarea" :rows="6" class="nx-mono" :placeholder="t('settings.security.cert.keyPemPh')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="importSubmitting" @click="submitImport">{{ t('settings.security.cert.importBtn') }}</el-button>
      </template>
    </el-dialog>

    <!-- 导入 SSH 公钥对话框 -->
    <el-dialog v-model="importKeyDialogVisible" :title="t('settings.security.sshKeys.importTitle')" width="600px">
      <el-form label-position="top" class="settings-form">
        <el-form-item :label="t('settings.security.sshKeys.publicKey')">
          <el-input v-model="importKeyForm.publicKey" type="textarea" :rows="5" class="nx-mono" :placeholder="t('settings.security.sshKeys.publicKeyPh')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importKeyDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="importKeySubmitting" @click="submitImportKey">{{ t('settings.security.sshKeys.importBtn') }}</el-button>
      </template>
    </el-dialog>

    <!-- 生成 SSH 密钥对对话框 -->
    <el-dialog v-model="genKeyDialogVisible" :title="t('settings.security.sshKeys.generateTitle')" width="520px">
      <el-form label-position="top" class="settings-form">
        <el-form-item :label="t('settings.security.sshKeys.keyType')">
          <el-select v-model="genKeyForm.type" style="width: 200px">
            <el-option value="ed25519" label="Ed25519（推荐）" />
            <el-option value="rsa" label="RSA" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="genKeyForm.type === 'rsa'" :label="t('settings.security.sshKeys.keyBits')">
          <el-select v-model="genKeyForm.bits" style="width: 160px">
            <el-option :value="2048" label="RSA 2048" />
            <el-option :value="4096" label="RSA 4096" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('settings.security.sshKeys.keyComment')">
          <el-input v-model="genKeyForm.comment" :placeholder="t('settings.security.sshKeys.keyCommentPh')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genKeyDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="genKeySubmitting" @click="submitGenerateKey">{{ t('settings.security.sshKeys.generateBtn') }}</el-button>
      </template>
    </el-dialog>

    <!-- 生成结果对话框（私钥仅展示一次） -->
    <el-dialog v-model="generatedKeyDialogVisible" :title="t('settings.security.sshKeys.resultTitle')" width="640px">
      <el-alert :title="t('settings.security.sshKeys.resultWarning')" type="warning" :closable="false" show-icon style="margin-bottom: 16px" />
      <template v-if="generatedKey">
        <div class="ssh-result-block">
          <div class="ssh-result-label">{{ t('settings.security.sshKeys.resultPublicKey') }}</div>
          <div class="ssh-result-value nx-mono">{{ generatedKey.publicKey }}</div>
          <el-button size="small" @click="copyToClipboard(generatedKey.publicKey)">{{ t('settings.security.sshKeys.copy') }}</el-button>
        </div>
        <div class="ssh-result-block">
          <div class="ssh-result-label">{{ t('settings.security.sshKeys.resultPrivateKey') }}</div>
          <div class="ssh-result-value nx-mono ssh-private">{{ generatedKey.privateKey }}</div>
          <el-button size="small" @click="copyToClipboard(generatedKey.privateKey)">{{ t('settings.security.sshKeys.copy') }}</el-button>
        </div>
        <div class="ssh-result-block">
          <div class="ssh-result-label">{{ t('settings.security.sshKeys.resultFingerprint') }}</div>
          <div class="ssh-result-value nx-mono">{{ generatedKey.fingerprint }}</div>
        </div>
      </template>
      <template #footer>
        <el-button type="primary" @click="generatedKeyDialogVisible = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cert-hint {
  font-size: 12px;
  color: var(--nx-text-dim, #8a8a8a);
  margin-bottom: 12px;
  line-height: 1.5;
}
.cert-card {
  border: 1px solid var(--nx-border, #2a2a2a);
  padding: 16px;
  min-height: 64px;
}
.cert-status-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.cert-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.cert-detail-item {
  display: flex;
  gap: 12px;
  font-size: 13px;
  line-height: 1.5;
}
.cert-label {
  flex: 0 0 130px;
  color: var(--nx-text-dim, #8a8a8a);
}
.cert-value {
  flex: 1;
  word-break: break-all;
  color: var(--nx-text, #f2f2f2);
}
.cert-fp {
  font-size: 11px;
}
.cert-error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-bottom: 16px;
  word-break: break-all;
}
.cert-actions {
  display: flex;
  gap: 8px;
}
.ssh-keys-meta {
  font-size: 11px;
  color: var(--nx-text-dim, #8a8a8a);
  margin-bottom: 12px;
  word-break: break-all;
}
.ssh-keys-table {
  margin-bottom: 16px;
}
.ssh-fp {
  font-size: 11px;
  word-break: break-all;
}
.ssh-keys-empty {
  color: var(--nx-text-dim, #8a8a8a);
  font-size: 13px;
  margin-bottom: 16px;
}
.ssh-result-block {
  margin-bottom: 16px;
}
.ssh-result-label {
  font-size: 12px;
  color: var(--nx-text-dim, #8a8a8a);
  margin-bottom: 4px;
}
.ssh-result-value {
  font-size: 12px;
  word-break: break-all;
  white-space: pre-wrap;
  background: var(--nx-bg-2, #1a1a1a);
  border: 1px solid var(--nx-border, #2a2a2a);
  padding: 8px;
  margin-bottom: 6px;
  max-height: 160px;
  overflow: auto;
}
.ssh-private {
  color: var(--el-color-warning);
}
</style>
