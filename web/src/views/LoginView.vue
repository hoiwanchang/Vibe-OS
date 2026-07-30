<script setup lang="ts">
/**
 * 登录页 — 全屏黑底工业风
 */
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const showChangePwd = ref(false);
const newPwd = ref('');
const newPwd2 = ref('');

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    const user = await auth.login(username.value, password.value);
    if (user.mustChangePassword) {
      showChangePwd.value = true;
    } else {
      redirect();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '登录失败';
    error.value = msg;
  } finally {
    loading.value = false;
  }
}

async function handleChangePwd() {
  if (newPwd.value.length < 6) { error.value = '密码至少 6 位'; return; }
  if (newPwd.value !== newPwd2.value) { error.value = '两次密码不一致'; return; }
  try {
    await auth.changePassword(password.value, newPwd.value);
    showChangePwd.value = false;
    // 重新登录
    await auth.login(username.value, newPwd.value);
    redirect();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '修改失败';
  }
}

function redirect() {
  const target = (route.query.redirect as string) || '/';
  router.push(target);
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">VIBE OS</h1>
      <p class="login-sub">私有 AI NAS 系统</p>

      <template v-if="!showChangePwd">
        <el-form @submit.prevent="handleLogin">
          <el-input v-model="username" placeholder="用户名" prefix-icon="User" size="large" />
          <el-input v-model="password" type="password" placeholder="密码" prefix-icon="Lock"
            size="large" show-password style="margin-top:12px" @keyup.enter="handleLogin" />
          <el-alert v-if="error" :title="error" type="error" :closable="false"
            style="margin-top:12px" />
          <el-button type="primary" size="large" :loading="loading" style="margin-top:16px;width:100%"
            @click="handleLogin">登 录</el-button>
        </el-form>
      </template>

      <template v-else>
        <el-alert title="首次登录，请修改默认密码" type="warning" :closable="false" style="margin-bottom:12px" />
        <el-input v-model="newPwd" type="password" placeholder="新密码（≥6位）" size="large" show-password />
        <el-input v-model="newPwd2" type="password" placeholder="确认新密码" size="large"
          show-password style="margin-top:12px" @keyup.enter="handleChangePwd" />
        <el-alert v-if="error" :title="error" type="error" :closable="false" style="margin-top:12px" />
        <el-button type="primary" size="large" style="margin-top:16px;width:100%"
          @click="handleChangePwd">确认修改</el-button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  background-image: radial-gradient(circle, #1a1a1a 1px, transparent 1px);
  background-size: 24px 24px;
}
.login-card {
  width: 360px;
  padding: 40px 32px;
  background: #0a0a0a;
  border: 1px solid #222;
}
.login-title {
  font-family: 'Chakra Petch', monospace;
  font-size: 28px;
  font-weight: 700;
  color: #f0a500;
  letter-spacing: 4px;
  margin: 0;
}
.login-sub {
  color: #666;
  font-size: 13px;
  margin: 4px 0 28px;
}
</style>
