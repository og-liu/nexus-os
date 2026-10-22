# Nexus OS

面向个人用户的智能工作空间：把日常工具、自动化流程、知识管理与 AI Agent 能力整合到一个平台里。

> **当前进度**：应用外壳、登录注册、工具中心、便签、待办清单、日期时间面板、每日一句已完成；Agent / 知识 / 文件 / 自动 / 设置仍为「开发中」占位。

---

## 本地跑起来

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

首次访问会被挡到 `/login`，注册一个账号即可进入。

> ⚠️ **项目路径不能含空格**，否则原生模块（better-sqlite3）编译/加载会失败。
> Node 版本由 `.nvmrc` 固定为 22.23.2，包管理器只用 pnpm（`packageManager` 已锁定）。

---

## 提交前门禁

五项全绿才算完成一次改动：

```bash
pnpm exec next typegen  # 生成路由 / 布局类型（typecheck 的前置）
pnpm typecheck          # 类型（tsc --noEmit）
pnpm lint               # 代码规范
pnpm test               # 单元测试（内存 SQLite，不碰本地数据）
pnpm build              # 生产构建（能构建过才算真的能跑）
```

CI 会跑同样的检查，然后构建并发布。

---

## 技术栈

Node 22 · pnpm · Next.js 16（App Router）· React 19 · TypeScript 5 · Tailwind CSS 4 · SQLite（better-sqlite3）· Vitest

选型理由、版本、目录职责见 `docs/`。

---

## 文档

| 文档 | 只回答 |
|---|---|
| [`docs/技术栈说明.md`](docs/技术栈说明.md) | 用什么技术、什么版本、为什么 |
| [`docs/数据库/`](docs/数据库/) | 数据库设计：有哪些表、每张表每一列是什么意思 |
| [`docs/项目目录结构说明.md`](docs/项目目录结构说明.md) | 文件该放在哪 |
| [`docs/界面设计规范.md`](docs/界面设计规范.md) | 界面长什么样 |
| [`docs/功能/`](docs/功能/) | 一个功能一份文档：要什么、怎么设计、怎么验收 |
| [`docs/部署方案.md`](docs/部署方案.md) | 怎么上线、怎么回滚 |
| [`docs/Git协作规范.md`](docs/Git协作规范.md) | 分支怎么开、代码怎么进 `main`、谁在什么时候合并 |
| [`docs/开发日志.md`](docs/开发日志.md) | 干过什么、为什么、踩了什么 |

**规则：先改文档，再改代码。** 依赖与目录的变更也一样——先登记，再落地。

---

## 部署

合并 PR 到 `main` 即自动发布（`main` 有分支保护，禁止直推——详见《Git协作规范》）：GitHub Actions 检查 → 构建 → 传到 ECS → 切版本 → 重启（约 1 分钟）。
数据库文件在服务器的 `/opt/nexus-os/shared/data/`，跨版本保留；回滚用 `release.sh --rollback`。

细节与踩坑记录见 [`docs/部署方案.md`](docs/部署方案.md)。
