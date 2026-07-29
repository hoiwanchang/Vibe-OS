/**
 * 应用入口
 * Element Plus 全量注册（控制台组件覆盖面广，按需收益有限且增加维护成本）
 * vue-i18n 提供 zh-CN / en 双语，自动检测浏览器语言
 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import App from './App.vue';
import router from './router';
import { i18n } from './i18n';
import './styles/main.css';

const app = createApp(App);

// 注册全部图标为全局组件
for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, component);
}

app.use(createPinia());
app.use(router);
app.use(i18n);
// Element Plus 组件文案由 App.vue 的 ElConfigProvider 动态驱动
app.use(ElementPlus);

app.mount('#app');
