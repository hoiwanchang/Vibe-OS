/**
 * 桌面应用注册表 — 单一数据源
 * 桌面图标 / 开始菜单 / 窗口内容渲染 / 任务栏均从此读取，
 * 新增应用只需在此登记一处
 */
import {
  Coin,
  Connection,
  Download,
  FolderChecked,
  FolderOpened,
  Grid,
  Monitor,
  Odometer,
  Setting,
  Share,
  Timer,
} from '@element-plus/icons-vue';
import type { Component } from 'vue';
import type { DesktopAppId } from '@/stores/wm';

/** 应用元信息 */
export interface DesktopAppMeta {
  id: DesktopAppId;
  title: string;
  /** 图标组件（Element Plus icon） */
  icon: Component;
  /** 是否出现在桌面图标区 */
  onDesktop: boolean;
  /** 是否出现在开始菜单 */
  inStartMenu: boolean;
  /** 开始菜单分组 */
  group?: '系统' | '网络' | '存储' | '服务';
}

/** 应用注册表（有序，决定桌面图标与开始菜单顺序） */
export const DESKTOP_APPS: DesktopAppMeta[] = [
  {
    id: 'dashboard',
    title: '仪表盘',
    icon: Odometer,
    onDesktop: true,
    inStartMenu: true,
    group: '系统',
  },
  {
    id: 'apps',
    title: '应用中心',
    icon: Grid,
    onDesktop: true,
    inStartMenu: true,
    group: '系统',
  },
  {
    id: 'settings',
    title: '系统设置',
    icon: Setting,
    onDesktop: true,
    inStartMenu: true,
    group: '系统',
  },
  {
    id: 'tailscale',
    title: 'Tailscale',
    icon: Connection,
    onDesktop: true,
    inStartMenu: true,
    group: '网络',
  },
  {
    id: 'monitor',
    title: '资源监视器',
    icon: Monitor,
    onDesktop: false,
    inStartMenu: true,
    group: '系统',
  },
  {
    id: 'files',
    title: '文件管理',
    icon: FolderOpened,
    onDesktop: true,
    inStartMenu: true,
    group: '存储',
  },
  {
    id: 'storage',
    title: '存储池',
    icon: Coin,
    onDesktop: true,
    inStartMenu: true,
    group: '存储',
  },
  {
    id: 'sharing',
    title: '共享文件夹',
    icon: Share,
    onDesktop: true,
    inStartMenu: true,
    group: '存储',
  },
  {
    id: 'backup',
    title: '备份中心',
    icon: FolderChecked,
    onDesktop: true,
    inStartMenu: true,
    group: '存储',
  },
  {
    id: 'download',
    title: '下载中心',
    icon: Download,
    onDesktop: true,
    inStartMenu: true,
    group: '服务',
  },
  {
    id: 'network',
    title: '网络配置',
    icon: Connection,
    onDesktop: true,
    inStartMenu: true,
    group: '网络',
  },
  {
    id: 'scheduler',
    title: '计划任务',
    icon: Timer,
    onDesktop: true,
    inStartMenu: true,
    group: '服务',
  },
];

/** 按 id 查找应用元信息 */
export function getAppMeta(id: DesktopAppId): DesktopAppMeta | undefined {
  return DESKTOP_APPS.find((a) => a.id === id);
}
