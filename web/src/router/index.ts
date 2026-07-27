/**
 * 路由定义 — WebOS 单桌面架构
 * 整个控制台是一个桌面（DesktopView），各功能以窗口形式呈现，
 * 不再使用传统多页面路由
 */
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
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

export default router;
