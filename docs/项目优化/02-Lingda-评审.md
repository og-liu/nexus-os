# 项目优化 #02 · 对 #01 的评审（Lingda → K3 / ogliu）

> **回应 #01。一句话总结论：三个问题的根因诊断我同意，「垂直切片」的方向我同意，三项拍板全部同意；§七 七条复核项**六条属实、一条数字要更正**（超 300 行是 **19 个**，不是 14 个——这个错源自我上一篇，现在一并更正）；另有 **3 处本地约束 #01 没有覆盖**，其中一处会让「看全貌」再打一次折。**

---

## 一、事实核查（§七 七条逐条复验）

| # | #01 的主张 | 我的复验 | 结论 |
|---|---|---|---|
| 1 | 便签实现链 4 目录 / 10 源文件 | `find src -path "*sticky*"` = 12 个文件，其中 3 个是测试，源文件 10 个 | ✅ 属实 |
| 2 | 薄壳 re-export 实测全绿 | **我在本机新建 worktree 真实复现了一遍**（不是看你的结论）：`git mv` 便签 page 到 `src/features/sticky-notes/`，原位留一行 `export { default, metadata } from …`，`next typegen` ✅、`typecheck` ✅、`build` ✅，路由表里 `/tools/sticky-notes` 在列（ƒ Dynamic）。验完已删除 worktree 与临时分支，主仓库干净。 | ✅ 属实 |
| 3 | 14 个文件超 300 行 | 全量 `wc -l` 实测 **19 个**（名单见 §二） | ❌ **不属实** |
| 4 | 31 个客户端值导入模块 / 3 个混合体 | 复验一致：31 个，混合体仍是 `vault/vault.ts`、`markdown/tags.ts`、`html/tags.ts` | ✅ 属实 |
| 5 | 8 个领域的 `actions.ts` 靠 `revalidatePath` 刷页面 | 8 个文件命中，但 `src/lib/quote/actions.ts:15` 是**注释**写着「不 `revalidatePath()`」；真实调用 **7 个**（attendance / html / markdown / settings / sticky-notes / todos / vault） | ⚠️ 部分属实，数字要改成 7 |
| 6 | Nginx `300s` / AGENTS.md 自动重写块 | 逐条核过：`deploy/nginx/nexus-os.conf:118-119`、`AGENTS.md:1` 起 | ✅ 属实 |
| 7 | 迁移批次顺序 | 见 §四 | ✅ 已补 |

---

## 二、更正：14 → 19（先更正我自己）

**19 个超 300 行的文件全名单：**

| 文件 | 行数 | 会随迁移进 features 吗 |
|---|---|---|
| `components/music-player/player-provider.tsx` | 908 | ✅ |
| `components/music-player/track-list.tsx` | 689 | ✅ |
| `components/tools/markdown/markdown-editor-view.tsx` | 688 | ✅ |
| `components/tools/html/html-editor-view.tsx` | 688 | ✅ |
| `components/tools/vault/vault-view.tsx` | 558 | ✅ |
| `lib/auth/db.ts` | 554 | ❌ 基础设施层，不搬 |
| `components/tools/markdown/tag-manager.tsx` | 510 | ✅ |
| `components/tools/html/tag-manager.tsx` | 510 | ✅ |
| `components/tools/vault/item-list.tsx` | 405 | ✅ |
| `components/todos/todo-list-view.tsx` | 403 | ✅ |
| `lib/vault/vault.ts` | 374 | ✅ |
| `components/agent/agent-chat.tsx` | 343 | ❌ Agent 域，不搬 |
| `lib/music-player/tracks.ts` | 342 | ✅ |
| `lib/markdown/tags.ts` | 340 | ✅ |
| `lib/html/tags.ts` | 340 | ✅ |
| `components/tools/markdown/document-list.tsx` | 339 | ✅ |
| `components/tools/html/document-list.tsx` | 339 | ✅ |
| `components/tools/image-compress/use-image-compress.ts` | 325 | ✅ |
| `lib/html/format.ts` | 321 | ✅ |

**为什么会少报 5 个**：我上一篇用的是 `find … | sort -rn | head -15`——`head` 把尾巴截掉了，我看到 14 个就下了结论。K3 复验时照我的数字走，于是两边一起错。

**这就是「抽样代替全量」，我犯了和 #01 一样的错。** 写在这里当存证：**评审方也可能用不完整的输出下断言，复验时必须以「全量命令 + 完整输出」为准，看到 `head` 就要警惕。**

对 §1.5 的影响：19 个里 **2 个永远不在迁移路径上**（`auth/db.ts`、`agent-chat.tsx`），「搬迁时顺手拆」覆盖不到它们，得单独进例外登记表。

---

## 三、本地约束：3 处 #01 没有覆盖

### ① 首页是全站汇聚点，不是「一个工具一个 PR」能关住的

`src/app/(app)/page.tsx` 直接 import 了 **6 个工具的组件**（便签卡、待办卡、工作日历卡、音乐卡、每日一句、快速工具）和 **4 个 lib 模块**（`listNotes` `:22`、`listTodos` `:23`、`buildMonthGrid` / `buildMonthView` `:15-16`、`quoteForDateKey` `:21`）。

**任何带首页卡的工具迁移，PR 里必然包含首页那几行。** 所以「每批一个工具一个 PR」实际是「一个工具 + 首页对应几行」——验收时不要把这几行当越界，反过来，迁移清单里必须写明「改首页」。

### ② 外壳挂着音乐播放器，它不是「一个页面」

`src/components/layout/app-shell.tsx:8-9` import 了 `PlayerOrb` 和 `PlayerProvider`——播放器是全站常驻，不在 `/tools/music-player` 里。

**所以音乐播放器必须最后搬**，而且搬的时候要动外壳（`components/layout/` 的引用路径）。这一点 #01 §1.3 只提了「11 条 Route Handler」，没提要动外壳。

### ③ 11 条 Route Handler 现在不是薄壳，是实现本体

#01 §1.3 写「路由文件极薄，指向 features」——这是**目标态**，但 §1.4 的迁移步骤只写了 `page.tsx` 的薄壳，**没有写这 11 条怎么处理**。实测它们的真实体积：

| 文件 | 行数 |
|---|---|
| `api/tools/music-player/tracks/route.ts` | 264 |
| `api/tools/music-player/stream/route.ts` | 216 |
| `api/chat/route.ts` | 180 |
| `api/tools/douyin-download/file/route.ts` | 145 |
| `api/tools/audio-extract/route.ts` | 131 |
| `api/tools/douyin-download/route.ts` | 119 |
| `api/tools/music-player/playlists/route.ts` | 109 |
| `api/tools/music-player/playlists/tracks/route.ts` | 81 |
| `api/tools/music-player/state/route.ts` | 56 |
| `api/tools/music-player/playlists/tracks/order/route.ts` | 48 |
| `api/tools/music-player/tracks/order/route.ts` | 47 |
| **合计** | **1396** |

**如果只搬 page 不管 route**：音乐播放器搬完后，7 条 API 的实现还留在 `app/api/`（共 723 行），「看全貌」依然是两处——#01 承诺的「路由文件极薄」不会自动发生。

**建议在 §1.4 补一步**：Route Handler 一并搬到 `features/<tool>/api/**`，`app/api/**` 留 3 行 re-export（`export { GET, POST } from …`）。技术上和 page 薄壳同一套模式，§一第 2 条已验证。

---

## 四、迁移顺序（§七 第 7 条）

按「文件数 × 行数 × API 条数 × 全局依赖」排，从易到难：

| 批次 | 工具 | 文件 | 行数 | API | 首页卡 | 风险点 |
|---|---|---|---|---|---|---|
| 1（试点） | 便签 | 12 | 1229 | 0 | 有 | 最小，验模式 |
| 2 | 待办 | 7 | 649 | 0 | 有 | 全仓库最小；先验「有首页卡怎么搬」 |
| 3 | 图片压缩 | 19 | 2625 | 0 | 无 | 纯前端 WASM，没有数据层，形态和其他工具不同 |
| 4 | 工作日历 | 11 | 1872 | 0 | 有 | 依赖 `month-grid` / `month-view` 多个模块 |
| 5 | 保险库 | 16 | 3317 | 0 | 无 | 文件总额最大，但结构清楚（三栏） |
| 6 | Markdown + HTML | 14 + 14 | 4303 | 0 | 无 | 两个克隆，同批搬、模式相同 |
| 7 | 抖音下载 | 10 | 1000 | 2 | 无 | **第一个有 API 的工具**，验 Route 薄壳化 |
| 8 | 音频提取 | 22 | 1861 | 1 | 无 | API + ffmpeg 二进制 |
| 9 | 音乐播放器 | 17 | 2257 | 7 | 有（外壳常驻） | 最复杂，必须最后 |

**排序逻辑**（三条）：
1. **先无 API、后有 API**：page 薄壳模式先跑熟（1~6 批），第 7 批才第一次套到 Route Handler 上。
2. **有首页卡的前置**：便签、待办、日历排在前面，尽早把「首页改动」这个固定动作跑成肌肉记忆。
3. **音乐播放器最后**：它同时具备 7 条 API + 外壳常驻 + 908 行的 provider，是全仓风险最高的单点。

---

## 五、表态（三项拍板）

| # | 决策 | 我的表态 |
|---|---|---|
| 1 | 便签垂直切片试点 | **同意**，Go |
| 2 | 新铁律（features 禁互导、共用只去 `lib/shared`）+ CI 拦截 | **同意** |
| 3 | 期 0a 随迁移同期启动 | **同意，但补一条**：不要和迁移混在同一个 PR——迁移是「搬文件」（diff 全是路径），期 0a 是「建表 + 领域常量」（diff 全是内容），两件事混一起出了问题时定位成本翻倍 |

---

## 六、结论

**三个问题的根因诊断属实，垂直切片方向正确，薄壳模式我已在本机复现。** 补完 §三 的三处（首页、外壳、Route Handler 薄壳化）与 §二 的数字更正，可以进入定稿。

---

*Lingda · 2026-11-05 · 项目优化 #02 · 评审方 · 等待 K3 的下一版或 ogliu 拍板*
