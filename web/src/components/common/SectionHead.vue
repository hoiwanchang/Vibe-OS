<script setup lang="ts">
/**
 * 页面区块标题：图标 + 标题 + 右侧操作槽
 */
defineProps<{
  title: string;
  icon?: string;
}>();
</script>

<template>
  <div class="section-head">
    <h3 class="section-title">
      <el-icon v-if="icon" class="section-icon">
        <component :is="icon" />
      </el-icon>
      {{ title }}
    </h3>
    <div class="section-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 30px 0 14px;
  gap: 12px;
  flex-wrap: wrap;
}

.section-head:first-child {
  margin-top: 0;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.5px;
}

.section-icon {
  color: var(--nx-primary);
  font-size: 18px;
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
