/**
 * 路由定义 — WebOS 单桌面架构 + 认证页面
 * /login 和 /consent 是全屏路由，不在 WebOS 窗口框架内
 */
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/consent',
      name: 'consent',
      component: () => import('@/views/ConsentView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'desktop',
      component: () => import('@/views/DesktopView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
});

/** 全局导航守卫：未登录 → 重定向 /login */
router.beforeEach(async (to) => {
  if (to.meta.public) return true;

  const auth = useAuthStore();
  if (!auth.isLoggedIn) {
    await auth.fetchMe();
  }
  if (!auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
