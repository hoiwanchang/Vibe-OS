/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  /** 演示模式：后端不可用时使用内置模拟数据 */
  readonly VITE_DEMO_MODE?: string;
  /** 开发代理目标（仅 vite.config.ts 使用） */
  readonly VITE_API_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
