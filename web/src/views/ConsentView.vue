<script setup lang="ts">
/**
 * OIDC 用户同意页 — 全屏
 */
import { ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const clientName = ref((route.query.client_name as string) || '未知应用');
const scope = ref((route.query.scope as string) || 'openid');
const redirectUri = ref((route.query.redirect_uri as string) || '');
const original = ref((route.query.original as string) || '');

const scopeDescriptions: Record<string, string> = {
  openid: '验证您的身份',
  profile: '读取您的用户名和基本信息',
  email: '读取您的邮箱地址',
  groups: '读取您的用户组',
  offline_access: '允许应用离线访问（刷新令牌）',
};

const scopeList = scope.value.split(' ').filter(Boolean);

function approve() {
  // 重定向回 /oidc/authorize 带 consent=approved
  const sep = original.value.includes('?') ? '&' : '?';
  window.location.href = `${original.value}${sep}consent=approved`;
}

function deny() {
  // 重定向回 redirect_uri 带 error
  const url = new URL(redirectUri.value);
  url.searchParams.set('error', 'access_denied');
  url.searchParams.set('error_description', '用户拒绝授权');
  window.location.href = url.toString();
}
</script>

<template>
  <div class="consent-page">
    <div class="consent-card">
      <h2 class="consent-title">应用授权</h2>
      <p class="consent-client">{{ clientName }}</p>
      <p class="consent-desc">该应用请求以下权限：</p>
      <ul class="consent-scopes">
        <li v-for="s in scopeList" :key="s">
          <span class="scope-name">{{ s }}</span>
          <span class="scope-desc">{{ scopeDescriptions[s] || s }}</span>
        </li>
      </ul>
      <div class="consent-actions">
        <el-button @click="deny">拒绝</el-button>
        <el-button type="primary" @click="approve">授权</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.consent-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  background-image: radial-gradient(circle, #1a1a1a 1px, transparent 1px);
  background-size: 24px 24px;
}
.consent-card {
  width: 400px;
  padding: 32px;
  background: #0a0a0a;
  border: 1px solid #222;
}
.consent-title {
  font-family: 'Chakra Petch', monospace;
  color: #f0a500;
  margin: 0 0 8px;
}
.consent-client { color: #fff; font-size: 18px; font-weight: 600; margin: 0 0 16px; }
.consent-desc { color: #999; font-size: 13px; }
.consent-scopes { list-style: none; padding: 0; margin: 12px 0 24px; }
.consent-scopes li { padding: 8px 0; border-bottom: 1px solid #1a1a1a; display: flex; justify-content: space-between; }
.scope-name { color: #f0a500; font-family: monospace; font-size: 13px; }
.scope-desc { color: #888; font-size: 12px; }
.consent-actions { display: flex; gap: 12px; justify-content: flex-end; }
</style>
