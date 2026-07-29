<script setup lang="ts">
/**
 * Tailscale ACL 可视化编辑器
 * 规则行编辑（action / src / dst）+ hosts 别名 + JSON 实时预览
 * 下发调用 POST /api/tailscale/acl
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { storeToRefs } from 'pinia';
import { useUsersStore } from '@/stores/users';

const { t } = useI18n();
const store = useUsersStore();
const { aclRules, aclHosts, aclDirty, aclPushing } = storeToRefs(store);

const jsonPreview = computed(() =>
  JSON.stringify(store.buildAclPolicy(), null, 2),
);

/** 逗号分隔字符串 ↔ 数组双向转换 */
function joinList(list: string[]): string {
  return list.join(', ');
}

function splitList(text: string): string[] {
  return text
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function updateSrc(id: number, text: string): void {
  const rule = aclRules.value.find((r) => r.id === id);
  if (rule) {
    rule.src = splitList(text);
    store.markAclDirty();
  }
}

function updateDst(id: number, text: string): void {
  const rule = aclRules.value.find((r) => r.id === id);
  if (rule) {
    rule.dst = splitList(text);
    store.markAclDirty();
  }
}

function updateAction(id: number, action: string | number | boolean): void {
  const rule = aclRules.value.find((r) => r.id === id);
  if (rule) {
    rule.action = action === 'deny' ? 'deny' : 'accept';
    store.markAclDirty();
  }
}

function addHost(): void {
  aclHosts.value.push({ name: '', ip: '' });
  store.markAclDirty();
}

function removeHost(index: number): void {
  aclHosts.value.splice(index, 1);
  store.markAclDirty();
}

async function push(): Promise<void> {
  try {
    await store.pushAcl();
    ElMessage.success(t('users.acl.applied'));
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
  }
}
</script>

<template>
  <div class="nx-panel acl-panel">
    <div class="nx-panel-title">
      <el-icon><Lock /></el-icon>{{ t('users.acl.title') }}
      <el-tag v-if="aclDirty" type="warning" size="small" effect="plain">
        {{ t('users.acl.unsaved') }}
      </el-tag>
    </div>

    <!-- 规则列表 -->
    <div class="acl-rules">
      <div class="acl-rule acl-rule--head">
        <span class="acl-col-action">{{ t('users.acl.colAction') }}</span>
        <span class="acl-col-src">{{ t('users.acl.colSrc') }}</span>
        <span class="acl-col-dst">{{ t('users.acl.colDst') }}</span>
        <span class="acl-col-op" />
      </div>
      <div v-for="rule in aclRules" :key="rule.id" class="acl-rule">
        <el-select
          :model-value="rule.action"
          size="small"
          class="acl-col-action"
          @update:model-value="updateAction(rule.id, $event)"
        >
          <el-option :label="t('users.acl.accept')" value="accept" />
          <el-option :label="t('users.acl.deny')" value="deny" />
        </el-select>
        <el-input
          :model-value="joinList(rule.src)"
          size="small"
          class="acl-col-src nx-mono"
          :placeholder="t('users.acl.srcPh')"
          @update:model-value="updateSrc(rule.id, String($event))"
        />
        <el-input
          :model-value="joinList(rule.dst)"
          size="small"
          class="acl-col-dst nx-mono"
          :placeholder="t('users.acl.dstPh')"
          @update:model-value="updateDst(rule.id, String($event))"
        />
        <el-button
          size="small"
          text
          type="danger"
          class="acl-col-op"
          :disabled="aclRules.length <= 1"
          @click="store.removeAclRule(rule.id)"
        >
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="acl-toolbar">
      <el-button size="small" @click="store.addAclRule()">
        <el-icon><Plus /></el-icon>{{ t('users.acl.addRule') }}
      </el-button>
      <el-button size="small" @click="addHost()">
        <el-icon><CollectionTag /></el-icon>{{ t('users.acl.addHostAlias') }}
      </el-button>
    </div>

    <!-- 主机别名 -->
    <div v-if="aclHosts.length > 0" class="acl-hosts">
      <div v-for="(host, idx) in aclHosts" :key="idx" class="acl-host-row">
        <el-input
          v-model="host.name"
          size="small"
          :placeholder="t('users.acl.aliasPh')"
          class="nx-mono"
          @input="store.markAclDirty()"
        />
        <span class="acl-host-eq">=</span>
        <el-input
          v-model="host.ip"
          size="small"
          placeholder="100.x.x.x"
          class="nx-mono"
          @input="store.markAclDirty()"
        />
        <el-button size="small" text type="danger" @click="removeHost(idx)">
          <el-icon><Delete /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- JSON 预览 -->
    <div class="acl-preview-head">{{ t('users.acl.jsonPreview') }}</div>
    <pre class="nx-terminal acl-preview">{{ jsonPreview }}</pre>

    <div class="acl-footer">
      <el-button type="primary" :loading="aclPushing" @click="push">
        <el-icon><Upload /></el-icon>{{ t('users.acl.apply') }}
      </el-button>
      <span class="acl-tip">{{ t('users.acl.tip') }}</span>
    </div>
  </div>
</template>

<style scoped>
.acl-rules {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.acl-rule {
  display: flex;
  gap: 10px;
  align-items: center;
}

.acl-rule--head {
  font-size: 11.5px;
  color: var(--nx-text-faint);
  letter-spacing: 1px;
  margin-bottom: 2px;
}

.acl-col-action { width: 92px; flex-shrink: 0; }
.acl-col-src { flex: 1.2; }
.acl-col-dst { flex: 1.2; }
.acl-col-op { width: 40px; flex-shrink: 0; }

.acl-toolbar {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.acl-hosts {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.acl-host-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.acl-host-eq {
  color: var(--nx-text-faint);
  font-family: 'JetBrains Mono', monospace;
}

.acl-preview-head {
  font-size: 11.5px;
  color: var(--nx-text-faint);
  letter-spacing: 1px;
  margin: 16px 0 8px;
}

.acl-preview {
  margin: 0;
  max-height: 220px;
  font-size: 11.5px;
}

.acl-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.acl-tip {
  font-size: 11.5px;
  color: var(--nx-text-faint);
}

@media (max-width: 860px) {
  .acl-rule {
    flex-wrap: wrap;
  }

  .acl-col-action { width: 100%; }
  .acl-col-src,
  .acl-col-dst { flex: 1 1 100%; }
}
</style>
