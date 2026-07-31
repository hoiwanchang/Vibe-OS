<script setup lang="ts">
/**
 * 首次安装向导（Phase 7）
 * 全屏路由 /setup，ISO 安装后首次访问自动进入
 * 步骤：欢迎 → 管理员 → 存储 → 网络 → 服务 → 完成
 */
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { setupApi } from '@/api';

const router = useRouter();
const { t, locale } = useI18n();

const step = ref(0);
const loading = ref(false);
const steps = computed(() => [
  t('setup.welcome'),
  t('setup.admin'),
  t('setup.storage'),
  t('setup.network'),
  t('setup.services'),
  t('setup.done'),
]);

/* 步骤 1：管理员 */
const adminForm = reactive({
  username: 'admin',
  password: '',
  confirmPassword: '',
  enable2fa: false,
});

/* 步骤 2：存储 */
const storageForm = reactive({
  disks: [] as string[],
  poolType: 'single' as 'single' | 'raid1' | 'raid5',
  filesystem: 'ext4' as 'ext4' | 'btrfs' | 'xfs',
});
const availableDisks = ref<{ name: string; size: string; model: string }[]>([]);

/** 磁盘选择变更 */
function onDiskSelectionChange(rows: { name: string }[]): void {
  storageForm.disks = rows.map(r => r.name);
}

/* 步骤 3：网络 */
const networkForm = reactive({
  method: 'dhcp' as 'dhcp' | 'static',
  ip: '',
  netmask: '24',
  gateway: '',
  dns: '',
});

/* 步骤 4：服务 */
const serviceForm = reactive({
  smb: true,
  ftp: false,
  dlna: true,
  docker: false,
});

async function loadDisks() {
  try {
    const res = await setupApi.disks();
    availableDisks.value = res ?? [];
  } catch { availableDisks.value = []; }
}

function next() {
  if (step.value === 0) {
    // 欢迎页，加载磁盘
    void loadDisks();
  }
  if (step.value === 1) {
    if (!adminForm.password || adminForm.password !== adminForm.confirmPassword) {
      ElMessage.error(t('setup.passwordMismatch'));
      return;
    }
    if (adminForm.password.length < 8) {
      ElMessage.error(t('setup.passwordTooShort'));
      return;
    }
  }
  if (step.value < steps.value.length - 1) {
    step.value++;
  }
}

function prev() {
  if (step.value > 0) step.value--;
}

async function finish() {
  loading.value = true;
  try {
    await setupApi.complete({
      admin: {
        username: adminForm.username,
        password: adminForm.password,
        enable2fa: adminForm.enable2fa,
      },
      storage: {
        disks: storageForm.disks,
        poolType: storageForm.poolType,
        filesystem: storageForm.filesystem,
      },
      network: {
        method: networkForm.method,
        ip: networkForm.ip || undefined,
        netmask: networkForm.netmask || undefined,
        gateway: networkForm.gateway || undefined,
        dns: networkForm.dns || undefined,
      },
      services: serviceForm,
    });
    ElMessage.success(t('setup.complete'));
    await router.push('/login');
  } catch {
    ElMessage.error(t('common.operationFailed'));
  } finally {
    loading.value = false;
  }
}

function setLocale(lang: string) {
  locale.value = lang;
  localStorage.setItem('vibeos-locale', lang);
}
</script>

<template>
  <div class="setup">
    <div class="setup__container">
      <div class="setup__header">
        <h1 class="setup__logo">VIBE OS</h1>
        <p class="setup__subtitle">{{ t('setup.subtitle') }}</p>
      </div>

      <el-steps :active="step" finish-status="success" align-center class="setup__steps">
        <el-step v-for="(s, i) in steps" :key="i" :title="s" />
      </el-steps>

      <div class="setup__body">
        <!-- 步骤 0：欢迎 -->
        <div v-if="step === 0" class="setup__panel">
          <h2>{{ t('setup.welcomeTitle') }}</h2>
          <p class="setup__desc">{{ t('setup.welcomeDesc') }}</p>
          <div class="setup__lang">
            <el-button :type="locale === 'zh-CN' ? 'primary' : 'default'" @click="setLocale('zh-CN')">中文</el-button>
            <el-button :type="locale === 'en' ? 'primary' : 'default'" @click="setLocale('en')">English</el-button>
          </div>
        </div>

        <!-- 步骤 1：管理员 -->
        <div v-else-if="step === 1" class="setup__panel">
          <h2>{{ t('setup.adminTitle') }}</h2>
          <el-form label-width="120px" class="setup__form">
            <el-form-item :label="t('setup.username')">
              <el-input v-model="adminForm.username" class="nx-mono" />
            </el-form-item>
            <el-form-item :label="t('setup.password')">
              <el-input v-model="adminForm.password" type="password" show-password class="nx-mono" />
            </el-form-item>
            <el-form-item :label="t('setup.confirmPassword')">
              <el-input v-model="adminForm.confirmPassword" type="password" show-password class="nx-mono" />
            </el-form-item>
            <el-form-item :label="t('setup.enable2fa')">
              <el-switch v-model="adminForm.enable2fa" />
            </el-form-item>
          </el-form>
        </div>

        <!-- 步骤 2：存储 -->
        <div v-else-if="step === 2" class="setup__panel">
          <h2>{{ t('setup.storageTitle') }}</h2>
          <el-table :data="availableDisks" size="small" class="nx-mono" @selection-change="onDiskSelectionChange">
            <el-table-column type="selection" width="45" />
            <el-table-column prop="name" label="Disk" width="120" />
            <el-table-column prop="size" label="Size" width="100" />
            <el-table-column prop="model" label="Model" />
          </el-table>
          <el-form label-width="120px" class="setup__form" style="margin-top: 16px;">
            <el-form-item :label="t('setup.poolType')">
              <el-select v-model="storageForm.poolType">
                <el-option label="Single" value="single" />
                <el-option label="RAID 1" value="raid1" />
                <el-option label="RAID 5" value="raid5" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('setup.filesystem')">
              <el-select v-model="storageForm.filesystem">
                <el-option label="ext4" value="ext4" />
                <el-option label="btrfs" value="btrfs" />
                <el-option label="xfs" value="xfs" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>

        <!-- 步骤 3：网络 -->
        <div v-else-if="step === 3" class="setup__panel">
          <h2>{{ t('setup.networkTitle') }}</h2>
          <el-form label-width="120px" class="setup__form">
            <el-form-item :label="t('setup.netMethod')">
              <el-radio-group v-model="networkForm.method">
                <el-radio value="dhcp">DHCP</el-radio>
                <el-radio value="static">{{ t('setup.static') }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <template v-if="networkForm.method === 'static'">
              <el-form-item label="IP">
                <el-input v-model="networkForm.ip" placeholder="192.168.1.100" class="nx-mono" />
              </el-form-item>
              <el-form-item :label="t('setup.netmask')">
                <el-input v-model="networkForm.netmask" placeholder="24" class="nx-mono" />
              </el-form-item>
              <el-form-item :label="t('setup.gateway')">
                <el-input v-model="networkForm.gateway" placeholder="192.168.1.1" class="nx-mono" />
              </el-form-item>
              <el-form-item label="DNS">
                <el-input v-model="networkForm.dns" placeholder="192.168.1.1" class="nx-mono" />
              </el-form-item>
            </template>
          </el-form>
        </div>

        <!-- 步骤 4：服务 -->
        <div v-else-if="step === 4" class="setup__panel">
          <h2>{{ t('setup.servicesTitle') }}</h2>
          <div class="setup__services">
            <label class="setup__service"><el-switch v-model="serviceForm.smb" /> SMB / CIFS</label>
            <label class="setup__service"><el-switch v-model="serviceForm.ftp" /> FTP / SFTP</label>
            <label class="setup__service"><el-switch v-model="serviceForm.dlna" /> DLNA / UPnP</label>
            <label class="setup__service"><el-switch v-model="serviceForm.docker" /> Docker</label>
          </div>
        </div>

        <!-- 步骤 5：完成 -->
        <div v-else class="setup__panel setup__panel--center">
          <h2>{{ t('setup.doneTitle') }}</h2>
          <p class="setup__desc">{{ t('setup.doneDesc') }}</p>
        </div>
      </div>

      <div class="setup__footer">
        <el-button v-if="step > 0" @click="prev">{{ t('common.back') }}</el-button>
        <div class="setup__footer-spacer" />
        <el-button v-if="step < steps.length - 1" type="primary" @click="next">{{ t('common.next') }}</el-button>
        <el-button v-else type="primary" :loading="loading" @click="finish">{{ t('setup.startSetup') }}</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0a0a;
  color: #e0e0e0;
}
.setup__container {
  width: 720px;
  max-width: 95vw;
  border: 1px solid #333;
  padding: 32px;
}
.setup__header {
  text-align: center;
  margin-bottom: 24px;
}
.setup__logo {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 6px;
  color: #f0a030;
  margin: 0;
}
.setup__subtitle {
  color: #888;
  font-size: 13px;
  margin-top: 4px;
}
.setup__steps {
  margin-bottom: 24px;
}
.setup__body {
  min-height: 280px;
}
.setup__panel h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px;
}
.setup__panel--center {
  text-align: center;
  padding-top: 40px;
}
.setup__desc {
  color: #999;
  font-size: 13px;
  line-height: 1.6;
}
.setup__lang {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}
.setup__form {
  max-width: 420px;
}
.setup__services {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.setup__service {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}
.setup__footer {
  display: flex;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #333;
}
.setup__footer-spacer {
  flex: 1;
}
</style>
