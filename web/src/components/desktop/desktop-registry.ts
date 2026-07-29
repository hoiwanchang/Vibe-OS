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
  /** i18n 标题键（`wm.titles.{id}`），由消费组件经 t() 翻译 */
  title: string;
  /** 图标组件（Element Plus icon） */
  icon: Component;
  /** 是否出现在桌面图标区 */
  onDesktop: boolean;
  /** 是否出现在开始菜单 */
  inStartMenu: boolean;
  /** 开始菜单分组 i18n 键（`wm.groups.{key}`） */
  group?: 'system' | 'network' | 'storage' | 'services';
}

/** 应用注册表（有序，决定桌面图标与开始菜单顺序） */
export const DESKTOP_APPS: DesktopAppMeta[] = [
  {
    id: 'dashboard',
    title: 'dashboard',
    icon: Odometer,
    onDesktop: true,
    inStartMenu: true,
    group: 'system',
  },
  {
    id: 'apps',
    title: 'apps',
    icon: Grid,
    onDesktop: true,
    inStartMenu: true,
    group: 'system',
  },
  {
    id: 'settings',
    title: 'settings',
    icon: Setting,
    onDesktop: true,
    inStartMenu: true,
    group: 'system',
  },
  {
    id: 'tailscale',
    title: 'tailscale',
    icon: Connection,
    onDesktop: true,
    inStartMenu: true,
    group: 'network',
  },
  {
    id: 'monitor',
    title: 'monitor',
    icon: Monitor,
    onDesktop: false,
    inStartMenu: true,
    group: 'system',
  },
  {
    id: 'files',
    title: 'files',
    icon: FolderOpened,
    onDesktop: true,
    inStartMenu: true,
    group: 'storage',
  },
  {
    id: 'storage',
    title: 'storage',
    icon: Coin,
    onDesktop: true,
    inStartMenu: true,
    group: 'storage',
  },
  {
    id: 'sharing',
    title: 'sharing',
    icon: Share,
    onDesktop: true,
    inStartMenu: true,
    group: 'storage',
  },
  {
    id: 'backup',
    title: 'backup',
    icon: FolderChecked,
    onDesktop: true,
    inStartMenu: true,
    group: 'storage',
  },
  {
    id: 'download',
    title: 'download',
    icon: Download,
    onDesktop: true,
    inStartMenu: true,
    group: 'services',
  },
  {
    id: 'network',
    title: 'network',
    icon: Connection,
    onDesktop: true,
    inStartMenu: true,
    group: 'network',
  },
  {
    id: 'scheduler',
    title: 'scheduler',
    icon: Timer,
    onDesktop: true,
    inStartMenu: true,
    group: 'services',
  },
];

/** 按 id 查找应用元信息 */
export function getAppMeta(id: DesktopAppId): DesktopAppMeta | undefined {
  return DESKTOP_APPS.find((a) => a.id === id);
}
