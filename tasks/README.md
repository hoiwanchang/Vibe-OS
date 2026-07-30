# Vibe OS 缺失功能开发任务索引

> 本目录包含 NAS 核心功能的开发任务书。每个任务文件是自包含的，Agent 读取后即可独立开发。

## 任务文件

| 文件 | 角色 | 说明 |
|------|------|------|
| `backend-nas-features.md` | 后端 Agent | 8 个后端模块的完整开发规范 |
| `frontend-nas-features.md` | 前端 Agent | 8 个前端窗口/视图的完整开发规范 |

## 功能清单与优先级

| # | 功能 | 优先级 | 后端模块 | 前端视图 |
|---|------|--------|----------|----------|
| 1 | 文件管理器 | P0 | `src/modules/filemanager/` | `FilesView.vue` |
| 2 | 存储池管理 | P0 | `src/modules/storage/` | `StorageView.vue` |
| 3 | 共享文件夹 | P0 | `src/modules/sharing/` | `SharingView.vue` |
| 4 | 备份与快照 | P1 | `src/modules/backup/` | `BackupView.vue` |
| 5 | 下载中心 | P1 | `src/modules/download/` | `DownloadView.vue` |
| 6 | 网络配置 | P1 | `src/modules/network/` | `NetworkView.vue` |
| 7 | 通知与告警历史 | P2 | `src/modules/notification/` | 集成到任务栏 |
| 8 | 计划任务 | P2 | `src/modules/scheduler/` | `SchedulerView.vue` |

## 开发约定（所有 Agent 必须遵守）

- 遵循根目录 `AGENTS.md` 的全部规范
- 后端模块结构：`{module}.controller.ts` / `.service.ts` / `.routes.ts` / `.types.ts` / `__tests__/`
- 前端遵循 WebOS 桌面架构：新视图注册到 `DesktopView.vue` 的窗口系统 + `wm.ts` store
- API 路径统一 `/api/{module}/{action}`，响应包装 `{ success, data, error? }`
- 所有数据操作限定在 `/data/` 目录树内
- 开发完成后自动执行 `pnpm lint && pnpm build && pnpm test`，不通过自行修复
