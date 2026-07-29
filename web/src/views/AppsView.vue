<script setup lang="ts">
/**
 * 应用中心 — 三标签页：应用商店 / 已安装 / 自定义部署（LLM 分析）
 */
import { onMounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useAppCenterStore } from '@/stores/appcenter';
import type { RegistryApp, AnalyzeRepoResult } from '@/api/types';

const { t } = useI18n();
const store = useAppCenterStore();
const {
  registry, installed, loading, deploying, analyzing,
  runningCount, installedIds, busy,
} = storeToRefs(store);

const activeTab = ref('store');
const searchQuery = ref('');
const categoryFilter = ref('');

/* ---------- 商店 ---------- */

const categoryLabels = computed<Record<string, string>>(() => ({
  media: t('apps.categoryMap.media'),
  files: t('apps.categoryMap.files'),
  security: t('apps.categoryMap.security'),
  tools: t('apps.categoryMap.tools'),
  monitoring: t('apps.categoryMap.monitoring'),
  network: t('apps.categoryMap.network'),
  ai: t('apps.categoryMap.ai'),
  other: t('apps.categoryMap.other'),
}));

const filteredRegistry = computed(() => {
  let apps = registry.value;
  if (categoryFilter.value) {
    apps = apps.filter((a) => a.category === categoryFilter.value);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    apps = apps.filter(
      (a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q),
    );
  }
  return apps;
});

/* ---------- 部署对话框 ---------- */

const deployVisible = ref(false);
const deployTarget = ref<RegistryApp | null>(null);

function openDeploy(app: RegistryApp): void {
  deployTarget.value = app;
  deployVisible.value = true;
}

async function confirmDeploy(): Promise<void> {
  if (!deployTarget.value) return;
  try {
    await store.deployFromRegistry({ appId: deployTarget.value.id });
    ElMessage.success(t('apps.deploySuccess', { name: deployTarget.value.name }));
    deployVisible.value = false;
    activeTab.value = 'installed';
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

/* ---------- 已安装操作 ---------- */

async function handleRestart(appId: string): Promise<void> {
  try {
    await store.restart(appId);
    ElMessage.success(t('apps.restarted'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function handleStop(appId: string): Promise<void> {
  try {
    await store.stop(appId);
    ElMessage.success(t('apps.stoppedApp'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function handleUninstall(appId: string, name: string): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('apps.uninstallConfirm', { name, appId }),
      t('apps.uninstallTitle'),
      { confirmButtonText: t('common.uninstall'), cancelButtonText: t('common.cancel'), type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await store.uninstall(appId);
    ElMessage.success(t('apps.uninstalled', { name }));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

/* ---------- 自定义部署（LLM 分析） ---------- */

const gitUrl = ref('');
const gitBranch = ref('');
const analyzeResult = ref<AnalyzeRepoResult | null>(null);
const customDeployVisible = ref(false);

async function handleAnalyze(): Promise<void> {
  if (!gitUrl.value.trim()) {
    ElMessage.warning(t('apps.enterGitUrl'));
    return;
  }
  try {
    analyzeResult.value = await store.analyzeRepo({
      gitUrl: gitUrl.value.trim(),
      branch: gitBranch.value.trim() || undefined,
    });
    ElMessage.success(t('apps.analyzeDone'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

async function confirmCustomDeploy(): Promise<void> {
  if (!analyzeResult.value) return;
  const r = analyzeResult.value;
  try {
    await store.deployCustom({
      name: r.name,
      image: r.image,
      ports: r.ports,
      volumes: r.volumes,
      env: r.env,
      gitUrl: gitUrl.value.trim(),
    });
    ElMessage.success(t('apps.deployedFromDraft', { name: r.name }));
    customDeployVisible.value = false;
    analyzeResult.value = null;
    gitUrl.value = '';
    activeTab.value = 'installed';
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}

/* ---------- 状态色 ---------- */

function statusType(status: string): 'success' | 'danger' | 'warning' | 'info' {
  if (status === 'running') return 'success';
  if (status === 'error') return 'danger';
  if (status === 'deploying') return 'warning';
  return 'info';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    running: t('apps.statusMap.running'),
    stopped: t('apps.statusMap.stopped'),
    error: t('apps.statusMap.error'),
    deploying: t('apps.statusMap.deploying'),
  };
  return map[status] ?? status;
}

onMounted(() => {
  void store.fetchAll();
});
</script>

<template>
  <div class="appcenter-view">
    <el-tabs v-model="activeTab">
      <!-- ===== 应用商店 ===== -->
      <el-tab-pane :label="t('apps.tabStore')" name="store">
        <div class="store-toolbar">
          <el-input
            v-model="searchQuery"
            :placeholder="t('apps.searchPh')"
            clearable
            class="store-search"
            prefix-icon="Search"
          />
          <el-select v-model="categoryFilter" :placeholder="t('apps.allCategories')" clearable class="store-category">
            <el-option
              v-for="(label, key) in categoryLabels"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
          <el-button circle :loading="loading" @click="store.fetchRegistry()">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>

        <div v-loading="loading" class="store-grid">
          <div
            v-for="app in filteredRegistry"
            :key="app.id"
            class="app-card nx-panel"
          >
            <div class="app-card-header">
              <span class="app-icon">{{ app.icon }}</span>
              <div class="app-meta">
                <div class="app-name">{{ app.name }}</div>
                <el-tag size="small" effect="plain" type="info">
                  {{ categoryLabels[app.category] ?? app.category }}
                </el-tag>
              </div>
              <el-tag
                v-if="installedIds.has(app.id)"
                size="small"
                type="success"
                effect="dark"
              >
                {{ t('apps.installed') }}
              </el-tag>
            </div>
            <p class="app-desc">{{ app.description }}</p>
            <div class="app-card-footer">
              <span class="app-image nx-mono">{{ app.image }}</span>
              <el-button
                v-if="!installedIds.has(app.id)"
                type="primary"
                size="small"
                @click="openDeploy(app)"
              >
                {{ t('apps.deploy') }}
              </el-button>
              <el-button v-else size="small" disabled>{{ t('apps.installed') }}</el-button>
            </div>
          </div>

          <el-empty
            v-if="!loading && filteredRegistry.length === 0"
            :description="t('apps.noMatch')"
            class="store-empty"
          />
        </div>
      </el-tab-pane>

      <!-- ===== 已安装 ===== -->
      <el-tab-pane name="installed">
        <template #label>
          {{ t('apps.tabInstalled') }}
          <el-badge v-if="runningCount > 0" :value="runningCount" type="success" class="tab-badge" />
        </template>

        <div class="installed-toolbar">
          <el-tag effect="plain" size="small">
            {{ t('apps.runningCount', { running: runningCount, total: installed.length }) }}
          </el-tag>
          <el-button circle :loading="loading" @click="store.fetchInstalled()">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>

        <el-table
          v-loading="loading"
          :data="installed"
          stripe
          class="installed-table"
        >
          <el-table-column prop="appId" :label="t('apps.colApp')" min-width="120">
            <template #default="{ row }">
              <span class="nx-mono">{{ row.appId }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="image" :label="t('apps.colImage')" min-width="200">
            <template #default="{ row }">
              <span class="nx-mono img-cell">{{ row.image }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.port')" width="120">
            <template #default="{ row }">
              <span class="nx-mono">
                {{ row.ports.map((p: Record<string, number>) => p.host).join(', ') || '—' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small" effect="dark">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('apps.colSource')" width="80" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="row.source === 'registry' ? 'info' : 'warning'">
                {{ row.source === 'registry' ? t('apps.sourceRegistry') : t('apps.sourceCustom') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.ops')" width="180" align="center">
            <template #default="{ row }">
              <el-button
                size="small"
                :loading="busy.has(row.appId)"
                @click="handleRestart(row.appId)"
              >
                {{ t('common.restart') }}
              </el-button>
              <el-button
                size="small"
                :loading="busy.has(row.appId)"
                @click="handleStop(row.appId)"
              >
                {{ t('common.stop') }}
              </el-button>
              <el-button
                size="small"
                type="danger"
                :loading="busy.has(row.appId)"
                @click="handleUninstall(row.appId, row.appId)"
              >
                {{ t('common.uninstall') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-empty
          v-if="!loading && installed.length === 0"
          :description="t('apps.notInstalledYet')"
        />
      </el-tab-pane>

      <!-- ===== 自定义部署 ===== -->
      <el-tab-pane :label="t('apps.tabCustom')" name="custom">
        <div class="custom-section nx-panel">
          <h4 class="section-title">{{ t('apps.customTitle') }}</h4>
          <p class="section-hint">
            {{ t('apps.customDesc') }}
          </p>
          <div class="custom-form">
            <el-input
              v-model="gitUrl"
              placeholder="https://github.com/user/repo.git"
              class="custom-url"
            >
              <template #prepend>Git URL</template>
            </el-input>
            <el-input
              v-model="gitBranch"
              :placeholder="t('apps.branchPh')"
              class="custom-branch"
            />
            <el-button
              type="primary"
              :loading="analyzing"
              @click="handleAnalyze"
            >
              {{ analyzing ? t('apps.analyzing') : t('apps.aiAnalyze') }}
            </el-button>
          </div>

          <!-- 分析结果 -->
          <div v-if="analyzeResult" class="analyze-result">
            <el-divider />
            <div class="result-header">
              <h4>{{ analyzeResult.name }}</h4>
              <el-tag
                :type="analyzeResult.confidence >= 0.7 ? 'success' : analyzeResult.confidence >= 0.4 ? 'warning' : 'danger'"
                size="small"
              >
                {{ t('apps.confidence', { pct: Math.round(analyzeResult.confidence * 100) }) }}
              </el-tag>
            </div>
            <p class="result-analysis">{{ analyzeResult.analysis }}</p>

            <el-descriptions :column="1" border size="small" class="result-config">
              <el-descriptions-item :label="t('apps.colImage')">
                <span class="nx-mono">{{ analyzeResult.image }}</span>
              </el-descriptions-item>
              <el-descriptions-item :label="t('common.port')">
                <span class="nx-mono">
                  {{ analyzeResult.ports.map((p) => `${p.host}→${p.container}`).join(', ') || t('apps.noPorts') }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item :label="t('apps.volumes')">
                <div v-for="(v, i) in analyzeResult.volumes" :key="i" class="nx-mono vol-line">
                  {{ v.host }} → {{ v.container }}{{ v.readonly ? ` (${t('apps.readOnly')})` : '' }}
                </div>
                <span v-if="analyzeResult.volumes.length === 0">{{ t('common.none') }}</span>
              </el-descriptions-item>
              <el-descriptions-item :label="t('apps.envVars')">
                <div v-for="(val, key) in analyzeResult.env" :key="key" class="nx-mono env-line">
                  {{ key }}={{ val }}
                </div>
                <span v-if="Object.keys(analyzeResult.env).length === 0">{{ t('common.none') }}</span>
              </el-descriptions-item>
            </el-descriptions>

            <div class="result-actions">
              <el-button type="primary" :loading="deploying" @click="confirmCustomDeploy">
                {{ t('apps.confirmDeploy') }}
              </el-button>
              <el-button @click="analyzeResult = null">{{ t('apps.discard') }}</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 注册表部署确认对话框 -->
    <el-dialog
      v-model="deployVisible"
      :title="t('apps.deployTitle', { name: deployTarget?.name ?? '' })"
      width="520px"
      destroy-on-close
    >
      <template v-if="deployTarget">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item :label="t('apps.colImage')">
            <span class="nx-mono">{{ deployTarget.image }}</span>
          </el-descriptions-item>
          <el-descriptions-item :label="t('common.port')">
            <span class="nx-mono">
              {{ deployTarget.ports.map((p) => `${p.host}→${p.container}`).join(', ') || t('apps.noPorts') }}
            </span>
          </el-descriptions-item>
          <el-descriptions-item :label="t('apps.volumes')">
            <div v-for="(v, i) in deployTarget.volumes" :key="i" class="nx-mono vol-line">
              {{ v.host }} → {{ v.container }}
            </div>
          </el-descriptions-item>
          <el-descriptions-item :label="t('apps.envVars')">
            <div v-for="(val, key) in deployTarget.env" :key="key" class="nx-mono env-line">
              {{ key }}={{ val }}
            </div>
          </el-descriptions-item>
        </el-descriptions>
        <p v-if="deployTarget.postInstallNote" class="deploy-note">
          💡 {{ deployTarget.postInstallNote }}
        </p>
      </template>
      <template #footer>
        <el-button @click="deployVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="deploying" @click="confirmDeploy">
          {{ t('apps.confirmDeploy') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.appcenter-view {
  animation: fade-up 0.3s ease both;
}

/* 商店工具栏 */
.store-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}
.store-search {
  flex: 1;
  max-width: 320px;
}
.store-category {
  width: 130px;
}

/* 商店网格 */
.store-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
  min-height: 120px;
}
.store-empty {
  grid-column: 1 / -1;
}

/* 应用卡片 */
.app-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.2s;
}
.app-card:hover {
  border-color: var(--nx-accent, #e6a23c);
}
.app-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-icon {
  font-size: 28px;
  line-height: 1;
}
.app-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.app-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--nx-text, #e0e0e0);
}
.app-desc {
  font-size: 12px;
  color: var(--nx-text-faint, #888);
  margin: 0;
  line-height: 1.5;
  flex: 1;
}
.app-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.app-image {
  font-size: 11px;
  color: var(--nx-text-faint, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 已安装 */
.installed-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.installed-table {
  width: 100%;
}
.img-cell {
  font-size: 11px;
}

/* 自定义部署 */
.custom-section {
  padding: 20px;
  max-width: 720px;
}
.section-title {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--nx-text, #e0e0e0);
}
.section-hint {
  font-size: 12px;
  color: var(--nx-text-faint, #888);
  margin: 0 0 16px;
  line-height: 1.6;
}
.custom-form {
  display: flex;
  gap: 10px;
  align-items: center;
}
.custom-url {
  flex: 1;
}
.custom-branch {
  width: 140px;
}

/* 分析结果 */
.result-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.result-header h4 {
  margin: 0;
  font-size: 15px;
}
.result-analysis {
  font-size: 12px;
  color: var(--nx-text-faint, #888);
  margin: 0 0 12px;
  line-height: 1.6;
}
.result-config {
  margin-bottom: 16px;
}
.vol-line, .env-line {
  font-size: 11px;
  padding: 2px 0;
}
.result-actions {
  display: flex;
  gap: 10px;
}

/* 部署对话框 */
.deploy-note {
  margin-top: 12px;
  font-size: 12px;
  color: var(--el-color-warning, #e6a23c);
  line-height: 1.5;
}

.tab-badge {
  margin-left: 4px;
}

@media (max-width: 720px) {
  .store-grid {
    grid-template-columns: 1fr;
  }
  .custom-form {
    flex-direction: column;
  }
  .custom-branch {
    width: 100%;
  }
}
</style>
