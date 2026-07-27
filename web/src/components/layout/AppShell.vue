<script setup lang="ts">
/**
 * 应用外壳布局：PC 侧边导航 + 移动端底部标签栏 + 顶栏
 * 顶栏展示演示模式徽标与硬件告警计数
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { demoActive } from '@/api/state';
import { useSystemStore } from '@/stores/system';

const route = useRoute();
const systemStore = useSystemStore();

const pageTitle = computed(() => String(route.meta['title'] ?? '系统总览'));
const alertCount = computed(() => systemStore.activeAlerts.length);
</script>

<template>
  <div class="nx-shell">
    <!-- PC 侧边栏 -->
    <aside class="nx-sidebar">
      <div class="nx-brand">
        <img src="/favicon.svg" alt="NAISys" class="nx-brand-logo" />
        <div>
          <div class="nx-brand-name">NAISys</div>
          <div class="nx-brand-sub">PRIVATE AI NAS</div>
        </div>
      </div>
      <nav class="nx-nav">
        <RouterLink to="/" class="nx-nav-item">
          <el-icon><Monitor /></el-icon>
          系统总览
        </RouterLink>
        <RouterLink to="/apps" class="nx-nav-item">
          <el-icon><Cpu /></el-icon>
          AI 应用中心
        </RouterLink>
        <RouterLink to="/users" class="nx-nav-item">
          <el-icon><UserFilled /></el-icon>
          用户与权限
        </RouterLink>
      </nav>
      <div class="nx-sidebar-footer">
        <span class="nx-dot nx-dot--ok" />
        本地运行 · 零外网依赖
      </div>
    </aside>

    <!-- 主区域 -->
    <div class="nx-main">
      <header class="nx-topbar">
        <div class="nx-topbar-title">{{ pageTitle }}</div>
        <div class="nx-topbar-right">
          <el-tag v-if="demoActive" type="warning" effect="dark" size="small">
            演示数据
          </el-tag>
          <el-badge :value="alertCount" :hidden="alertCount === 0" :max="9">
            <el-button circle size="small" @click="$router.push('/')">
              <el-icon><Bell /></el-icon>
            </el-button>
          </el-badge>
        </div>
      </header>

      <main class="nx-content">
        <RouterView />
      </main>
    </div>

    <!-- 移动端底部标签栏 -->
    <nav class="nx-mobile-tabbar">
      <RouterLink to="/" class="nx-nav-item">
        <el-icon><Monitor /></el-icon>
        总览
      </RouterLink>
      <RouterLink to="/apps" class="nx-nav-item">
        <el-icon><Cpu /></el-icon>
        应用
      </RouterLink>
      <RouterLink to="/users" class="nx-nav-item">
        <el-icon><UserFilled /></el-icon>
        用户
      </RouterLink>
    </nav>
  </div>
</template>
