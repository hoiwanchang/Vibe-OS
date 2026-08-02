/**
 * 认证状态管理 — Pinia store
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { request } from '@/api/client';

export interface AuthUser {
  uid: number;
  username: string;
  role: 'admin' | 'user';
  mustChangePassword: boolean;
}

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<AuthUser | null>(null);
  const isLoggedIn = computed(() => currentUser.value !== null);
  const isAdmin = computed(() => currentUser.value?.role === 'admin');

  async function login(username: string, password: string): Promise<AuthUser> {
    const res = await request<AuthUser>({ method: 'POST', url: '/auth/login', data: { username, password } });
    currentUser.value = res;
    return res;
  }

  async function logout(): Promise<void> {
    try {
      await request({ method: 'POST', url: '/auth/logout' });
    } catch { /* ignore */ }
    currentUser.value = null;
  }

  async function fetchMe(): Promise<void> {
    try {
      const res = await request<AuthUser>({ method: 'GET', url: '/auth/me' });
      currentUser.value = res;
    } catch {
      currentUser.value = null;
    }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await request({ method: 'POST', url: '/auth/change-password', data: { currentPassword, newPassword } });
    currentUser.value = null;
  }

  return { currentUser, isLoggedIn, isAdmin, login, logout, fetchMe, changePassword };
});
