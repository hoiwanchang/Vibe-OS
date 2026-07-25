# NAISys — 开源私有 AI NAS 系统 · Agent 工作规范

> 本文件是本项目所有 AI Agent 的强制行为约束。任何代码生成、修改、构建操作必须遵守以下规则，违反即视为无效交付。

---

## 1. 项目概述

NAISys 是一个基于 Debian 13 的开源私有 AI NAS 操作系统，面向内网/离线环境，提供本地 AI 推理、文件管理、应用托管等能力。所有数据与服务完全本地化，零外网依赖。

---

## 2. Git 工作流与隔离

- 主分支为 `main`，代表稳定基线，**禁止直接提交**。
- 所有开发在独立 Git Worktree 的功能分支上进行，分支命名：`feat/<module>`、`fix/<issue>`、`refactor/<scope>`。
- 提交信息遵循 Conventional Commits：`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `refactor:`。
- 功能完成后提交 PR 至 `main`，由人工审核合并。Agent 不得自行 merge。
- 每个 PR 必须包含：代码变更 + 对应测试 + 文档更新（如适用）。

---

## 3. 技术栈（锁定）

| 层级 | 技术 | 版本约束 |
|------|------|----------|
| 系统底座 | Debian 13 (Trixie) amd64 | 固定 |
| 运行时 | Node.js LTS | ≥ 22.x |
| 应用框架 | Express + TypeScript | TS ≥ 5.x, strict mode |
| 包管理 | pnpm | workspace monorepo |
| 构建/ISO | GitHub Actions + xorriso + squashfs-tools | — |
| 测试 | Vitest (单元) + Supertest (API) | — |
| Lint | ESLint (flat config) + Prettier | — |
| 容器/隔离 | systemd service (非 root) | — |

未经本文件更新，不得引入上述表格之外的核心依赖。

---

## 4. 安全与权限红线（零容忍）

### 4.1 禁止操作

- **禁止**生成或执行：`rm -rf /`、`mkfs`、`dd if=/dev/zero`、`chmod 777 /` 等破坏性命令。
- **禁止**读写：`/boot/`、`/etc/shadow`、`/etc/gshadow`、`/etc/sudoers`、`/proc/`、`/sys/` 等敏感路径。
- **禁止**在代码中硬编码密码、密钥、token；使用环境变量或 `/data/naisys/secrets/` 下的权限受限文件。
- **禁止**以 root 身份运行任何 AI 服务或用户态应用进程。

### 4.2 强制要求

- 所有系统操作必须通过封装好的**原子化 API 层**（`src/system/`）调用，禁止在业务代码中直接 `exec`/`spawn` 裸 shell 命令。
- AI 推理服务以专用低权限用户 `naisys` 运行，通过 systemd `User=` 指令约束。
- 文件操作限定在 `/data/` 目录树内，路径必须经过 normalize + 前缀校验，防止路径穿越。
- 所有用户输入必须校验和转义，API 接口默认拒绝未认证请求。

---

## 5. 数据目录规范（强制）

```
/data/                          # 用户数据根目录（唯一合法数据根）
├── {uid}/                      # 用户个人空间（以用户 ID 隔离）
│   ├── files/                  # 用户文件
│   ├── config/                 # 用户配置
│   └── cache/                  # 用户缓存
└── naisys/                     # AI 系统应用目录
    ├── {appname}/              # 各 AI 应用独立目录
    │   ├── models/             # 模型文件
    │   ├── data/               # 应用数据
    │   └── logs/               # 应用日志
    ├── secrets/                # 密钥存储（0700 权限）
    └── cache/                  # 系统级缓存
```

### 禁止事项

- **禁止**将用户数据或 AI 应用数据存储在 `/home/`、`/opt/`、`/var/`、`/tmp/`（持久数据）下。
- **禁止**跨用户目录访问（`/data/{uid_a}/` 不得被 uid_b 的进程读取）。
- 日志文件仅写入 `/data/naisys/{appname}/logs/`，禁止写入 `/var/log/`。

---

## 6. 隐私与离线（核心原则）

- 所有模型文件、缓存、日志、向量数据库均存储于 `/data/naisys/` 本地目录。
- **禁止**任何外网请求：不得调用外部 API、不得上报遥测、不得下载远程资源（构建时依赖镜像除外）。
- 系统必须在完全断网环境下正常启动和运行全部功能。
- 依赖安装仅允许通过预置的本地 registry 镜像或离线包。

---

## 7. 交付标准

每个功能模块的 PR 必须包含以下全部产物，缺一不予合并：

| 产物 | 要求 |
|------|------|
| 可运行代码 | 通过 `pnpm build` 零错误 |
| RESTful 接口文档 | OpenAPI 3.1 spec（`docs/api/` 下 YAML） |
| 单元测试 | 覆盖率 ≥ 80%，`pnpm test` 全部通过 |
| CI 验证 | GitHub Actions workflow 全绿（lint + build + test） |
| 变更说明 | PR description 中说明动机、方案、影响范围 |

---

## 8. 自动化迭代循环（Agent 必须遵守）

代码编写完成后，Agent **必须自动执行**以下流水线，无需等待人工指令：

```
1. pnpm lint          → 不通过则自行修复
2. pnpm build         → 不通过则自行修复
3. pnpm test          → 不通过则自行修复
4. 重复 1-3 直到全部通过
5. 提交代码 + 输出测试结果摘要
```

- 单次迭代修复不超过 5 轮；若 5 轮后仍未通过，停止并输出完整错误日志供人工介入。
- 修复过程中不得删除或跳过测试用例来"通过"测试。

---

## 9. 代码规范

- TypeScript strict mode，禁止 `any`（除非有注释说明理由）。
- 所有公共函数必须有 JSDoc 注释。
- 错误处理：统一使用自定义 AppError 类，禁止裸 throw string。
- 异步操作统一 async/await，禁止裸 Promise 链。
- 文件命名：kebab-case（`user-service.ts`），类名 PascalCase，变量/函数 camelCase。
- 每个模块目录结构：

```
src/modules/{module}/
├── {module}.controller.ts
├── {module}.service.ts
├── {module}.routes.ts
├── {module}.types.ts
├── __tests__/
│   └── {module}.test.ts
└── index.ts
```

---

## 10. GitHub Actions CI 规范

- Workflow 文件位于 `.github/workflows/`。
- 必须包含的 Job：`lint` → `build` → `test`（串行依赖）。
- ISO 构建 Workflow 独立触发（tag push 或手动 dispatch）。
- CI 环境使用 `debian:trixie-slim` 容器，安装 xorriso + squashfs-tools。
- 构建产物（ISO）上传为 GitHub Release Artifact。

---

## 11. Agent 行为边界

- Agent 仅在本 Worktree 内操作，不得修改 `.git/` 内部文件、不得操作其他 Worktree。
- Agent 不得修改本 AGENTS.md 文件（规范变更由人工完成）。
- Agent 不得安装全局 npm 包、不得修改系统级配置。
- 遇到规范未覆盖的灰色地带，选择**更保守**的方案并在 PR 中标注 `[NEEDS REVIEW]`。
