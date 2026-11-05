<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 代码放哪（先看这条，别按老习惯往三层里塞）

**一个工具 = 一个目录**：`src/features/<工具>/{client,server,shared}/`。

| 文件特征 | 去哪层 |
|---|---|
| 带 `"use client"` | `client/` |
| 带 `"use server"`（actions） | `server/` |
| 碰 db / 文件系统 / 子进程 | `server/`，且顶部加 `import "server-only"` |
| 无标记的组件（RSC，如 page、首页卡） | `server/` |
| 无标记的纯函数（不碰 db / 文件 / 网络 / 密钥） | `shared/` |
| 测试文件 | 跟着各自源文件走 |

`app/` 只留薄壳：`page.tsx` 一行 `export { default, metadata } from "@/features/<工具>/server/page";`，
`route.ts` 三行（`runtime` / `dynamic` 两个 segment config **必须留在壳里** + re-export 方法）。

**四条铁律**：`features` 之间禁止互相 import；`client/` 与 `shared/` 禁止 import `server/`
（`import type` 与 `"use server"` 的 actions 除外）；import 方向 `app → features / components / lib`；
`server/` 下碰 db / 文件 / 子进程的文件必带 `server-only`。

`components/` 只剩外壳、`ui/`、工具页四个公共件（`tool-catalog` / `tool-header` / `tool-bar` /
`tool-mobile-bar`）与工具中心自身；`lib/` 只剩基础设施（auth / secrets / settings / agent /
datetime / quote / navigation / toast / shared）。细节与例外登记表见《项目目录结构说明》。

**每个工具的文档就是它的 `README.md`**（需求 / 界面 / 数据模型 / 关键决策 / 三层结构 / 验收 / 已知的坑），
与 `client/` `server/` `shared/` 并排。改一个工具前先读那份 README；`docs/功能/` 只剩不属于任何
工具的页面级文档（外壳 / 页签栏 / 工具中心 / 登录注册 / 用户密钥等）。

## 验证命令

改完代码按这个顺序跑：

1. `pnpm exec next typegen`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`
5. `pnpm build`

**为什么第一步不能省**：`LayoutProps`、`PageProps` 这类类型是 Next 在构建期生成到 `.next/types` 的，不属于源码。新 clone 的仓库还没生成过，直接跑 `typecheck` 会报 `Cannot find name 'LayoutProps'`——看起来像代码坏了，其实只是缺生成物。`pnpm test` 不需要这一步，`pnpm typecheck` 需要。

**`server-only` 与单测**：数据访问文件带 `import "server-only"` 之后，它的同目录单测跑在 Node
下会直接抛错（那个包只在 `react-server` 条件下才是空实现）。`vitest.config.mts` 里已把它别名到
包自带的 `empty.js`，**别删那条别名**。
