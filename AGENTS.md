<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 验证命令

改完代码按这个顺序跑：

1. `pnpm exec next typegen`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm lint`

**为什么第一步不能省**：`LayoutProps`、`PageProps` 这类类型是 Next 在构建期生成到 `.next/types` 的，不属于源码。新 clone 的仓库还没生成过，直接跑 `typecheck` 会报 `Cannot find name 'LayoutProps'`——看起来像代码坏了，其实只是缺生成物。`pnpm test` 不需要这一步，`pnpm typecheck` 需要。
