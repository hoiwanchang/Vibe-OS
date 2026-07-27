import { ref } from 'vue';

/**
 * 演示模式激活标志（响应式）
 * 后端不可达且开启演示模式时置 true，UI 顶部显示"演示数据"徽标
 */
export const demoActive = ref(false);
