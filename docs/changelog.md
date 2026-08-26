# 开发日志

按日期记录每次开发完成的改动，便于回溯项目演进历史。**最新记录在最上方**：每次开发结束后，由 AI 把当日变更插入到本文件顶部（最新日期在前）。

---

## 2026-08-26(午后·六) — Knowledge K3 前置：notes/trash 接库（同表 kind 区分 + 回收站软删闭环）

### 设计决策：共用一张表，而非分表
「我的文章」（手写笔记）与采集条目的骨架几乎一样（标题/正文/标签/时间），只是出身不同。定案：**同一张 `knowledge_items` 表 + `kind` 身份字段**（captured=采集 / note=手写）。收益是搜索、标签、回收站、将来的 AI 检索只维护一套设施，Agent 只查一处不会漏；代价是查询必须带 kind 防串味（由 route 层固定传入）。

### 数据层
- **迁移**：knowledge_items 补 `kind`（默认 captured，老数据天然吻合）与 `deleted_at` 两列，PRAGMA 检测幂等 ALTER
- **状态机保护**：进出回收站必须走 `trashItem`/`restoreItem`（同步维护 deleted_at），updateItem 直接改 trashed 会抛错——防止时间戳失步让 7 天清理失去依据
- **语义分野**：discarded=从未保留过（拍板放弃，无反悔期）；trashed=曾经保留再删（有 7 天反悔期）
- **懒清理**：列表请求顺手物理删除过期条目，不为单机 SQLite 养定时任务

### API
- GET 无 status 参数时排除回收站内容（分页计数才不错位）；POST 支持 kind=note 创建即 kept
- PATCH `{action:"trash"|"restore"}`；DELETE 默认软删进站、`?purge=true` 彻底删除

### 页面
- **我的文章接真库**：新建走草稿模式（点保存才落库，取消不留空记录垃圾）、编辑落库、打标签乐观更新+失败回滚、详情页 Markdown 渲染与知识流共用组件映射
- **回收站接真库**：捞回后按出身刷新对应列表、彻底删除二次确认、剩余天数由 deleted_at 现算
- **移除「加入知识流」按钮**：笔记入库后天然可被检索/AI 看到，原按钮建立在「笔记不在库」的旧前提上，语义已失效

---

## 2026-08-26(午后·五) — Knowledge K2：知识流页面（服务端检索 + 标签落库筛选 + Markdown 渲染）

### 背景
K1 采集闭环打通后推进 K2，目标「找得到、看得舒服」：搜索从浏览器本地过滤升级为服务端真检索；标签编辑从刷新即失的本地态落进数据库并可点选筛选；详情页正文接入 Markdown 渲染。范围说明：notes/trash 接库牵涉「笔记与采集条目的数据模型关系」设计，单独作为后续节点。

### store / API 层
- **全局标签操作**（store.ts）：`renameTag` 用「INSERT OR IGNORE 转投 + DELETE 旧名」两步走——直接 UPDATE 会撞复合主键，而两步走的语义正好是「合并」，符合整理标签直觉；受影响条目才刷 updated_at。`removeTag` 全局摘除。`listTags` 返回标签+使用计数（次数降序、字典序次键）
- **tags 路由**（`/api/knowledge/tags`）：GET 标签+计数驱动选择器候选；PATCH 全局重命名（from/to）；DELETE 全局删除。与 [id] 动态路由共存时静态段优先
- **单测 +4 例**：改名合并去重、空名/同名拒绝、删除不影响正文、计数降序——全套 29/29

### 页面接线（knowledge/page.tsx）
- **搜索服务端化**：输入停手 350ms 防抖后调 `loadFeed(q, tag)`，LIKE 检索在数据库执行；q 与 tag 是 AND 组合，可叠加筛选。移除 filteredFeed 前端过滤层——feed 本身就是「当前检索条件下的结果集」
- **标签筛选**：点列表里的标签 pill 即按该标签过滤（黑底白字高亮当前项），顶部横幅显示筛选中状态并可一键清除；正在筛选的标签被重命名/删除时自动同步或退出筛选
- **标签编辑落库**：打/删标签乐观更新本地 + PATCH 确认，失败回滚改前快照并 toast 提示；新建标签走同一入口自动落库并刷新候选列表
- **Markdown 渲染**：详情页正文接入 react-markdown + remark-gfm（依赖此前已在），components 显式映射黑白灰极简排版（标题分层/代码块深灰底/引用边框/表格边线）——存储保持纯文本单一事实源，只在展示层解析

---

## 2026-08-26(午后·四) — Knowledge K1：采集入口 + inbox 拍板流转接真数据

### 背景
K0 数据地基（05ff5ef）就绪后按路线图推进 K1：目标是最小采集闭环——手动粘贴文本/Markdown 进收件箱 → 待拍板列表「保留/放弃」→ 保留条目进知识流。范围克制：仅 feed 与 inbox 接真库，notes/trash/sources 等 section 保持 mock 等后续节点替换。

### 新增
- **集合路由**（`src/app/api/knowledge/route.ts`）：GET 列表支持 status/q/tag/limit/offset 组合查询，响应一次性带 countsByStatus 各状态计数（前端角标一次取齐，避免列表刷新了计数还是旧值的不同步）；POST 手动采集落库进 inbox（缺省状态由 store 单点维护），无标题时从正文首行截 40 字兜底——只粘一大段也能一键进箱。route 层只管参数解析与 HTTP 语义映射（400 客户端错 / 500 服务端错），数据清洗仍归 store 层，未来 Agent 工具直连 store 时行为与 HTTP 入口完全一致
- **单条路由**（`src/app/api/knowledge/[id]/route.ts`）：GET 详情；PATCH 字段更新 + 状态流转（保留=kept、放弃=discarded）+ tags 全量替换（改完重读一次保证返回含最新标签的完整行）；DELETE 硬删除。非法 status 在 route 层拦成 400，store 白名单作为内部调用方的最后一道闸

### 页面接线（knowledge/page.tsx）
- **首屏加载**：useEffect 并行拉收件箱（status=inbox）与知识流（status=kept），Promise.allSettled 保证单个接口故障不拖垮整页；加载中显示占位提示，防止闪「空空如也」误导用户
- **拍板流转**：保留 PATCH kept 接口确认后才动本地列表——成功后把后端返回的完整行转卡片带「刚刚入库」标记插知识流顶部，让「存进去」肉眼可见；放弃 PATCH discarded 后移出收件箱。失败时列表保持原样，不误导用户以为拍板成功
- **防连击与反馈**：savingId 在途锁统一禁用采集/拍板按钮；新增轻量 toast（底部黑条 2.4s 自动消失）替代静默失败
- **mock 联动清理**：回收站演示条目不再混入已接真库的收件箱（toast 明确告知而非静默失败）；删文章不再按标题从真知识流删同名条目（会误伤真实数据）；「笔记加入知识流」挂起到 K2 notes 接库；feed/inbox 条目 id 从 Date.now() 改为后端 UUID，DetailRef 相应拆成 string/number 联合类型

### 已知边界（留给 K2）
- feed 详情正文按空行分段渲染，Markdown 符号原样显示——渲染器 K2 接入
- 标签编辑仍是本地态（刷新即失），setTags API 已备好待接线
- 「放弃=discarded」不再进回收站：discarded（从未保留过）与 trashed（先进站再删）本就是两个语义，原 mock 把两者混为一谈；回收站完整流程等 trash 接库时统一设计

---

## 2026-08-26(午后·三) — Knowledge 开工：K0 数据地基（建表 + CRUD 数据层）

### 背景
Knowledge 模块（产品主阵地）正式开工。开工前两项数据地基决策已拍板：**内容格式 = Markdown 存 TEXT 列**（纯文本单一事实源，渲染归前端）；**组织方式 = 标签起步、双链后置**。推进路线沉淀在云盘《NexusOS完整度盘点与推进路线_20260826》：K0 地基 → K1 采集入口 → K2 知识流页面 → K3 Agent 衔接 → K4 向量检索 → K5 自动化采集。

### 新增
- **schema**（db.ts）：`knowledge_items` 主表（title/content/source/source_url/status/时间戳）——status 为生命周期四态 inbox(待拍板)→kept(保留)→trashed(回收站)，discarded(拍板放弃)，对应产品「待你拍板→知识流」采集流；`knowledge_item_tags` 标签多对多关联表（复合主键防重 + 外键级联清理）——用关联表而非 JSON 列，因为标签筛选是高频查询，索引精确匹配优于全表扫
- **CRUD 数据层**（`src/lib/knowledge/store.ts`）：createItem / getItem / listItems / updateItem / setTags / deleteItem / countsByStatus。依赖注入风格（首参连接，测试喂 :memory: 库）；状态白名单与标签清洗在 store 层把住数据边界；listItems 支持 status/tag/q 组合过滤（AND 语义）+ 分页 + total，q 用 LIKE 子串检索并转义 `% _ \` 通配符按字面匹配；排序带 rowid 第二排序键规避同毫秒不稳定（pitfalls #7 教训前置）；setTags 全量替换语义配事务包裹
- **单测 13 例**（store.test.ts）：创建回读/标签去重/空标题兜底/非法状态拒绝/三类过滤/组合条件/通配符字面匹配/分页 total/状态流转/setTags 多退少补/删除级联/计数——全套 25/25 通过

---

## 2026-08-26(午后·二) — 多步任务重复输出治理：素材与交付分离 + 流式阶段标记

### 问题
Plan-and-Execute 多步任务的回复出现大批量重复内容：问「agent开发中的skill，帮我做个详解」，拆了 3 步执行，最终产出四份互相重叠的长文——前三步各写了一份「面向用户的成文」，收尾汇总又整合出第四份；本轮消耗 92.2k tokens，输出大半是重复文字。根因是编排层设计缺陷而非模型抽风：① 中间步骤的流式产出与最终回答走同一条 SSE 通道、渲染进同一个正文气泡，步骤指令只说「汇报结果」没告诉模型「输出不给用户看」；② planner 拆出「整合撰写详解输出给用户」这类交付型步骤后，收尾又强制汇总再整合一遍，同一内容成文两次以上。

### 方案 A · 编排层治本
- **planner 拆解规则新增第 7 条**：「中间步骤只产素材、不做交付」，从源头禁止拆出撰写/整合/输出给用户的交付型步骤——最终成文由系统在收尾阶段统一完成
- **步骤指令立规矩**（buildStepInstruction）：明确告知模型「你的输出是内部工作笔记，仅供后续步骤引用，不会展示给用户」，要求结构化要点而非成文汇报，禁寒暄/过渡语/总结陈词
- **汇总指令强化**（SUMMARY_INSTRUCTION）：明确这是整轮对话中唯一一次面向用户的成文输出，要求连贯成品回答而非笔记罗列

### 方案 B · 协议层保险
- **LoopEvent 新增 phase 标记**：delta/reasoning 事件带 `phase: "working" | "final"`（缺省视为 final，兼容不打标的简单直答路径）；executeOneStep 新增 emitPhase 参数统一打标——步骤执行传 working、收尾汇总传 final，工具类事件不打标照常展示
- **route 层分流落库**：phase=working 的 delta 照常透传给前端（过程可观测），但不累积进 assistantContent——历史消息里只存干净的最终回答；reasoning 全程累积（思考本来就是折叠的过程视图）
- **前端分流渲染**：phase=working 的 delta 不追加进正文主气泡，主气泡只承载最终回答；执行过程的可观测性由进度面板（step_start/done/failed）+ 工具卡片继续覆盖

### 效果
无论计划拆几步，成文只发生一次；即使模型仍把笔记写成成文，前端也不会把过程内容混进主气泡——编排层治本 + 协议层兜底的双保险。

---

## 2026-08-26(午后) — 数据正确性排雷：会话并发锁 + 崩溃残留自愈 + 消息排序稳定化

### 问题
Agent 代码深度分析发现三颗数据正确性雷：① 同一会话可并发跑两轮 agentLoop（双开窗口/连点发送），两边交叉写库导致占位消息双 running、计划状态互相覆盖、SSE 事件串台；② 进程中途被杀后，running 计划与 running 占位消息永久残留——前端渲染假死「生成中」气泡，「继续」按钮点了被 resume 校验拒绝，既续不了跑也触发不了归档，彻底死锁；③ user 与 assistant 占位行在同一请求里共用同一个 `Date.now()`，created_at 相同时 SQLite 排序不稳定，回复可能跑到提问前面。

### 新增
- **turn-lock 模块**（`8d09b0d`）：模块级内存锁 `Set<sessionId>`——`tryLockTurn` / `unlockTurn` / `isTurnActive` 实现同会话互斥（进程内精确，多实例部署需换跨进程方案）；`healOrphanRunningState` 负责崩溃残留自愈，判据复用锁集合：本进程无活跃轮次时，DB 里的 running 必为上个已死进程的孤儿数据，可放心翻成 stopped
- **单测 5 例**（`turn-lock.test.ts`）：锁互斥与释放、跨会话隔离、孤儿 running 翻 stopped、终态/paused 数据不误伤、持锁期间活 running 不动

### 修改
- **chat 入口**：懒创建会话后「先自愈再抢锁」（顺序不能反——别人持锁时不能误伤活数据），抢锁失败返回 409「当前会话有任务正在执行」；流式执行的两个收尾出口（正常完成 / catch 中断报错）对称释放锁
- **会话详情 GET**：首页读取恢复计划前先自愈，刷新页面即可看到正确的「已中断 + 继续/放弃」面板，断点恢复链路接管残留数据
- **消息查询排序稳定化**：chat 历史查询（双层排序）与会话分页查询统一补 `rowid` 作第二排序键——rowid 是插入序号天然单调递增，同毫秒时后插入的 assistant 排在 user 之后，还原真实先后；翻页游标仅传 created_at 的复合游标边界记为已知限制
- **前端错误透出**：非流式响应失败时读出服务端拒绝文案给用户看，不再只抛「请求失败：409」

---

## 2026-08-26(午间) — 模型配置可用性梳理：默认模型动态化 + 未配置 Key 可视化

### 问题
只配置 OpenRouter、未配置 DeepSeek 时体验割裂：前端初始选中、新建会话都硬编码回落 `deepseek-v4-flash` 默认模型，消息发出去才收到「未配置 DEEPSEEK_API_KEY」（`ef95a8c`）——用户明明配了别家 Key 却一头雾水；选择器也不区分哪些模型真正可用，后端把非法模型一律兜回硬编码默认值。

### 新增
- **供应商 Key 状态接口** `/api/providers`：GET 返回各供应商「是否已配置 Key」布尔表（读 process.env 判断存在性，Key 本身永远不出服务端）；`Cache-Control: no-store` 保证 dev 改完 `.env.local` 重启即生效
- **providers 层三个服务端函数**：`isProviderConfigured` / `isModelConfigured` / `getFirstAvailableModelId`（注册表顺序第一个配了 Key 的模型；一个都没有时回落 DEFAULT_MODEL_ID）

### 修改
- **chat 入口双闸校验**：请求的模型先过白名单再过 Key 可用性，任一不过自动切到第一个可用的模型——不再让整轮跑到 LLM 调用时才报缺 Key
- **前端默认模型动态化**：新增 `resolveModel` 统一决策（记住的模型可用则沿用 → 第一个可用 → DEFAULT 兜底）；页面启动拉取可用性后当场校正当前选中项，正停在没 Key 的模型上就自动切走
- **新建会话不再重置回 DeepSeek**：沿用正在用的模型，其 Key 失效才自动换；切换旧会话同样过闸（会话记忆的模型可能已不可用）
- **选择器可视化**：没配 Key 的模型置灰禁选并标注「未配置 Key」，缺什么一目了然

### 决策记录
- 配置中心化（设置页管 Key 存 SQLite，运行时从库读）记入待办暂不做：涉及密钥落盘安全与整条读取链路改造，个人项目现阶段收益低；先以「可用性感知 + 动态默认」解决主要痛点

---

## 2026-08-26 — 质量基建：Vitest 单元测试体系 + Node 版本统一 + 停止内容丢失修复

### 新增
- **Vitest 单元测试体系**（`9abc2ef`）：新增 `vitest.config.mts` 与首个测试套件 `src/lib/agent/archive-stopped-turn.test.ts`，7 个用例全部通过；覆盖整轮配对归档、停止→续跑→又停止链路、重复归档幂等、不误伤历史消息、failed 不归档、计划状态流转。为支撑测试，`db.ts` 抽出 `initSchema(conn)` 与 `createInMemoryDb()`，生产库与内存测试库共用同一份 schema
- **Node 版本统一**（`d1579a5`）：新增 `.nvmrc` 固定 Node 22.23.2，dev server 与单元测试共用同一版本（进项目目录 `nvm use` 自动切换）；pnpm 经 corepack 在 Node 22 下启用（10.34.5）

### 修复
- **普通聊天停止后半截内容刷新丢失**（`5d44376`）：根因是流式 `delta` / `reasoning` / `tool_call` / `tool_result` / `tool_error` 事件只透传给前端、从不累积到持久化变量，abort 时 `persistAssistant("stopped")` 存的是空壳。修复后六类事件边收边累积，停止/断连时半截正文与工具调用随占位消息落库，刷新后保留
- **vitest.config.ts → vitest.config.mts 重命名**：消除 Vite「ESM syntax in a file loaded as CommonJS」警告；配置内 `__dirname` 替换为 `fileURLToPath(import.meta.url)`
- **环境问题排查**：better-sqlite3 原生模块在部分环境下加载即崩（SIGSEGV），定位出「prebuild 跳过编译 / 项目路径含空格 / NAPI 版本不足 / Coze 桌面端沙箱限制」四重原因，最终以 Node 22.23.2 源码编译解决（过程沉淀至 pitfalls.md #5/#6）

### 决策记录
- better-sqlite3 v13 需要 NAPI 10（Node ≥ 22.23.2）；旧版 Node 20/22.13 均不够。版本统一后不再来回切换
- 涉及原生模块的测试须在本机终端跑（Coze 沙箱禁止加载 .node 且拦截 spawn）

---

## 2026-08-25(下午~晚间) — Agent 编排升级：任务规划 Plan-and-Execute + 真停止 + 断点恢复

### 新增
- **任务规划 Plan-and-Execute**（`fb2961b`）：新增 `planner.ts`（LLM 拆解步骤清单，≤8 步，纯 JSON 输出 + 鲁棒解析：剥代码块/截大括号/去尾逗号）与 `plan.ts` 类型层；`loop.ts` 从单步 ReAct 升级为「规划 → 逐步执行 → 失败重试 → 汇总」编排。每步是小型 ReAct（≤4 轮工具往返），步级失败自动重试（≤2 次），重试前回滚上下文避免脏残留
- **HITL 补问暂停-续跑**（`34efa1f`）：规划器发现请求缺关键信息时拆出 `ask_user` 步骤，执行器在该步暂停（`plan_paused` 事件），问句原样抛给用户、计划存 paused 态；用户回复后 `resumeLoop` 把回答填回补问步骤并从断点继续，已完成步骤结果以摘要回灌上下文避免「失忆」。续跑中可再次暂停（多轮补问）
- **真停止 / 刷新保留**（`c63ea62` `3a45e33`）：AbortSignal 贯穿 callLLM 与每个循环检查点；assistant 消息先 INSERT 占位行（status=running）再以 800ms 节流增量落盘，停止/刷新后半截内容、思考过程、工具调用记录全部保留；前端发送按钮切换为停止按钮，渲染 stopped 态
- **断点恢复与继续/放弃**（`b9a9b7d` 及后续系列）：计划持久化新增 stopped/cancelled 状态；stopped 计划支持一键续跑（`resumeStoppedLoop`：中断时残留的 running 步骤重置 pending 重跑）或放弃（新增 `POST /api/plan` 归档入口）
- **会话身份先行 + 整轮配对归档**（`ec2e65c` `16d4444`）：发新消息时旧 stopped 任务整轮归档为 cancelled——user 提问一起收尾，「提问+半截回复」从模型上下文中整体消失但界面保留痕迹；归档动作前移到查历史之前（`7047bab`），杜绝旧需求污染本轮上下文（表现为停止后换话题 AI 仍答旧话题）
- **简单直答路径**（`4735808` `3680993` `367eed4`）：打招呼/闲聊等无任务意图消息经关键词启发式判定后绕开规划直接 ReAct 回答，不渲染进度面板；规划失败同样降级直答，不再出现假计划框
- **续跑接管摘除旧面板**（`52b919c`）：新任务开始时旧进度面板收敛为 cancelled，避免刷新前 UI 残留两个可恢复任务

### 修改
- **数据库**：新增 `task_plans` 表（goal/steps JSON/status 六态）；messages 表增加 `status` 列（running/done/stopped/failed/cancelled 消息生命周期）
- **历史构建规则**：只喂完整有效轮次，running/stopped/called 三种状态一律排除（注意 SQL 中 `!=` 对 NULL 不生效的坑，显式写 `IS NULL OR NOT IN`）
- **前端计划进度面板**（`4ee3038`）：step_start/done/failed/paused 实时渲染，断点续跑时继承后端快照状态不回退灰色；思考过程默认收起（`844c962`）

### 决策记录
- 一个会话同一时刻最多一个活动计划（running/paused），保证断点定位稳定；历史上已完成的计划保留多条供审计
- 「继续执行/放弃」仅对有计划的多步任务展示；普通聊天没有可恢复的计划，停止即终态（半截内容保留）
- paused 计划不算「被取代」，用户下一轮输入默认视为补问的回答走 resumeLoop

---

## 2026-08-25 — Agent 工具调用落地：Agent Loop + 真实天气/搜索 + 真流式

### 新增
- **Agent Loop 核心** `src/lib/agent/loop.ts`：模型决策 → 执行工具 → 结果回传 → 再决策的循环（MAX_STEPS=5 防死循环）；SSE 事件扩充为 tool_call / tool_result / tool_error / delta / reasoning
- **工具注册表** `src/lib/agent/tools.ts`：`buildToolsSchema()` 生成 Function Calling 工具清单 + `getTool()` 按名取工具 + 工具定义
- **真实天气工具 get_weather**：Open-Meteo 免费 API（无需 Key），两步调用（地理编码 geocoding → 天气预报 forecast），WMO 天气代码翻译中文，支持全球城市
- **联网搜索工具 web_search**：抽象搜索层 `src/lib/search/`（`types.ts` 接口 + `tavily.ts` 实现 + `index.ts` 工厂，按 SEARCH_PROVIDER 环境变量切换供应商），对接 Tavily（1000 次/月免费）
- **工具系统文档** `docs/tools.md`：8 章节覆盖工具架构 / 两个工具说明 / 搜索抽象层 / Loop 机制 / SSE 事件 / 前端展示 / 加新工具步骤 / 环境变量

### 修改
- **Agent Loop 真流式**（性能优化）：`callLLM` 由 `stream:false`（阻塞等整段生成 3-8s）改为 `stream:true`，正文/思考实时 delta 推送，tool_calls 的 arguments 按 index 增量拼接；**首字延迟从 8-10s 降至 1-2s**，删除假流式（4 字分块 + 15ms sleep）
- **系统提示** `route.ts`：SYSTEM_PROMPT 增加工具使用规则、搜索规范（6 条）、"全程中文思考"指令
- **对话界面** `agent/page.tsx`：工具调用改折叠式 ToolCallsBlock（一行摘要 + 点击展开详情，按天气/搜索分组）；修复双 loading、兜底消息不发送（跑满 MAX_STEPS 转圈）两个 bug
- **生成中控件锁定**：isLoading 时禁用模型切换 / 思考模式 / 图片上传 / 语音输入
- **思考过程默认展开**：新消息思考默认展开、流式增长可见，点标题可收起
- **数据库持久化落地**：messages 表加 `tool_calls` / `reasoning` / `usage` 三列，`agentLoop` 返回值由纯文本改为 `{ content, reasoning, toolCalls, usage }`，assistant 落库时把工具调用 JSON、思考全文与整轮 token 用量一并存入；前端 `rowToMessage` 解析还原，重开会话工具卡片、思考过程、本轮 token 消耗仍在（不再刷新即消失）
- **token 用量采集**：`callLLM` 请求加 `stream_options: { include_usage: true }`，从流式最后的 usage 块取 prompt/completion/total token；`agentLoop` 把一轮内多次调用（思考 + 工具后总结，最多 5 轮）的用量累加，随回复回传给前端展示「本轮 X tokens · 输入 / 输出」

### 决策记录
- 天气选 Open-Meteo：免费、无需 Key、两步 API，支持全球城市
- 搜索选 Tavily：免费额度、返回已清洗正文（免二次抓网页）
- 搜索层做抽象：`SearchProvider` 接口 + 工厂，未来切 Serper/Brave 只需实现接口 + 改环境变量
- 不引入 Vercel AI SDK：手写 Loop 与天气工具一致，便于理解全链路
- **工具调用、思考过程与 token 用量持久化（方案 A）**：messages 表新增 `tool_calls` / `reasoning` / `usage` 三列（TEXT 存 JSON），assistant 消息落库时把工具调用过程、完整思考内容与整轮 token 用量一起存，刷新 / 重开会话可还原展示（复用 ToolCallsBlock 与思考展开态）；`getDb()` 内做幂等迁移（PRAGMA 检测列后 ALTER 补列，旧库自动升级，不删库重建）

---

## 2026-08-24 — 模型接入开放化：多供应商架构 + 接入 Ox Alpha

### 新增
- **供应商适配层** `src/lib/providers/`
  - `types.ts`：共享类型（ChatMessage / ChatContentPart / ThinkingOptions / ProviderConfig / ThinkingStyle）
  - `openai.ts`：通用 OpenAI 兼容流式调用（baseURL / key / 模型名参数化，SSE 解析兼容 reasoning_content 与 reasoning），`ProviderError`
  - `index.ts`：供应商登记表（deepseek / openrouter）+ 统一 `streamChat(modelId, ...)` 入口
- **供应商 OpenRouter**：接入 `stealth/ox-alpha`（Ox Alpha，OpenAI 兼容、支持看图、当前免费窗口期）

### 修改
- **models.ts 模型与供应商解耦**：`ModelMeta` 新增 `provider` / `providerModel`，模型 id 不再兼任 API 模型名；新增 ox-alpha 条目（supportsVision=true、supportsThinking=false）
- **route.ts**：改用统一 `streamChat(modelId, history, thinking, onDelta)` 入口，报错类改为 `ProviderError`
- **深度思考彻底解耦**：thinking 状态纯按模型存储（`THINKING_PREFIX + modelId`），与会话无关，新对话/切模型各保持自己偏好

### 删除
- **src/lib/deepseek.ts**：DeepSeek 直连实现已迁入 providers/，旧文件移除

### 决策记录
- 采用「轻方案」：手写通用 OpenAI 兼容适配层，不引入 Vercel AI SDK；供应商差异仅是 baseURL / key / 思考参数「方言」
- 思考参数抽象为「方言」：deepseek 用 `thinking:{type}` + `reasoning_effort`，OpenAI 系用 `reasoning_effort`；各适配器自翻译
- Ox Alpha 暂不开深度思考（官方思考参数未确认，先当普通模型接），待确认后再补

---

## 2026-08-24 — Agent 对话体验增强：深度思考、图片看图、全局 Toast

### 新增
- **深度思考开关 + 三档 effort**（low / high / max），由模型 `supportsThinking` 能力驱动显隐
- **图片看图**：模型 `supportsVision` 能力驱动；上传（≤4 张、单张 5MB）→ 预览 → 发送；后端落盘 `public/uploads/`（库只存路径），历史图片多轮对话读回再喂
- **全局 Toast** `src/components/toast.tsx`：统一屏幕居中、放大，info / warn / error 三级，3 秒自动消失

### 修改
- **深度思考与模型解耦**：thinking 改按模型存储（`THINKING_PREFIX + modelId`），不再按会话——flash 开 3 档不影响 pro，新对话也保持各模型偏好
- **可扩展模型选择器**：基于 models.ts 注册表渲染，切模型自动恢复该模型自己的思考偏好
- `.gitignore` 追加 `/public/uploads`

---

## 2026-08-24 — AI Agent 落地真实对话：DeepSeek + SQLite + 会话管理

### 新增
- **DeepSeek 对话接入**：`/agent` 从 UI mock 落地为真实对话，SSE 流式输出（`delta` / `reasoning` / `error` / `done`）
- **SQLite 持久化** `src/lib/db.ts`：sessions / messages 表，消息含 content / images / reasoning
- **会话管理 API**：`GET|POST /api/sessions`、`GET /api/sessions/[id]`、`PATCH`（重命名）、`DELETE`
- **对话 API** `POST /api/chat`：接消息 → 落库 → 组装上下文（滑动窗口 20 轮）→ 流式调模型 → 落库回复 → 首条消息自动生成标题

### 修改
- **前端交互**：会话列表/新建/删除/重命名（自绘弹窗替代原生 alert）、恢复上次会话、消息气泡、思考过程折叠
- **上下文滑动窗口**：按轮裁最近 20 轮（40 条），控制 token

### 决策记录
- 图片「base64 直传 + 文件落 public/uploads + 库只存路径」，图片本体不入 SQLite
- 标题生成 v1 取首条用户消息截断（后续可升级智能摘要）

---

## 2026-08-24 — 删除 roadmap.md，文档瘦身

### 删除
- **docs/roadmap.md**：版本路线图文档。产品阶段路线已在 product-vision.md 第七章承载，各模块"待开发"状态在 architecture.md 版本状态段体现，roadmap 内容与二者重复且维护成本高，故移除

### 修改
- 清理 product-vision.md、architecture.md、agent-design.md、structure.md、README.md 中所有对 roadmap.md 的引用与版本号（v0.2.0~v1.0.0）标注；changelog 历史条目保留原貌不动

---

## 2026-08-24 — 全站 UI mock 成型与响应式收口

紧接上午产品总纲建立后，下午把原型知识流落进项目，并完成全站样式与响应式收口。Agent 页与知识页均为**纯前端 mock，无真实模型/存储/检索**。

### 新增
- **知识库页面** (`knowledge/page.tsx`，约 1670 行)
  - 7 个 section：知识流、我的文章、收件箱、回收站、订阅源、自测、回顾
  - 知识流：搜索 + 卡片列表（标题/大白话摘要/标签/时间），点击进详情
  - 我的文章：列表 + 阅读/编辑模式切换，可新建、编辑、删除、加入/移出知识流
  - 收件箱：采集输入 + 待拍板卡片，保留入知识流/放弃进回收站，红点计数联动
  - 回收站：7 天倒计时、捞回（按来源分流回收件箱/文章列表）、彻底删除二次确认
  - 订阅源：开关列表
  - 自测：闪卡（点击翻面）+ 选择题（ABC 选项，作答后锁定、正确绿色/错误红色反馈）
  - 回顾：四宫格统计（后两格可点击跳回收站/收件箱）+ 今日回顾时间线 + 本周小结进度条
  - 标签闭环：标签 pill hover 删除、＋ 新建、标签选择器弹层（多选勾选/新建/管理态重命名/全局删除二次确认）
- **AI Agent 页面 UI mock**（此前已完成）：对话消息流、任务卡片、语音/图片输入

### 修改
- **满高布局**：知识页与 Agent 页统一 `h-[calc(100%-4rem)]`，左右栏各自 `overflow-y-auto`，底部统计卡 `mt-auto` 钉底，解决切菜单高度跳动
- **容器铺满**：全站内容区去掉 `max-w-3xl/5xl` 限宽，100% 铺满仅留内边距；Agent 消息气泡保留 `max-w-[70%/85%]` 自适应
- **侧边栏同构**：知识页左栏对齐 Agent 页——260px 宽、顶部通栏黑按钮、双行导航项（主行粗体+次行灰描述）、底部 border-t + 白底统计卡
- **导航顺序**：侧边栏调整为 总览 / Agent / 知识 / 工具 / 文件 / 自动 / 设置（知识移至第 3 位）
- **响应式断点 md→lg**：8 个文件批量改造，结构性布局类统一上移到 `lg:`（1024px），字号/间距类保留 `md:`（768px）；确立三档——移动 <1024（含 iPad 竖屏，抽屉+移动控件）/ 窄屏 PC 1024-1279 / 宽屏 ≥1280
- **工具页三档交互**：xl 宽屏内联搜索+标签、lg 窄屏图标按钮+下拉、手机折叠列表
- **文档全量对齐**：conventions（响应式策略、导航顺序、满高布局、侧边栏同构规范）、structure（页面状态表、组件说明）、architecture（v0.1.0 完成项）、roadmap（v0.1.0 清单）、agent-design（状态更新为 UI mock 已完成）

### 决策记录
- 结构性分界锁定 lg（1024px），iPad 竖屏统一走移动布局，消除触屏误当 PC 的问题
- 自测/回顾不另立页面，作为知识页左栏"学习 & 回顾"分组下的 section，复用知识数据
- 闪卡翻面用 state 条件渲染而非 CSS 3D transform，规避兼容问题
- 知识页当前为单文件 mock（1670 行），接真实数据前再按 section 拆组件

### 已知技术债
- `knowledge/page.tsx` 单文件 1670 行、十几个 useState，mock 阶段可接受，接数据前需拆分
- `src/app/page.tsx:125` GreetingCard `setNow` in effect 触发 React 19 lint 规则（历史遗留，未改）
- files / automation 仍为空壳占位

---

## 2026-08-24 — 产品总纲建立与知识能力融入

### 新增
- **docs/product-vision.md**：建立项目产品总纲（产品层面唯一真相源），明确 Nexus OS 定位、人机协作知识流水线理念、四目的、模块能力地图、跨模块协作关系与产品阶段路线

### 修改
- **roadmap.md**：v0.5.0 知识库由 6 行概述细化为完整流水线（数据模型/采集/Inbox 审查/AI 提炼去重关联/阅读编辑/语义检索）；v0.4.0 Agent 补充「知识库优先 RAG」「一句话多步任务」；v0.6.0 自动化补充「定时采集综述/保鲜扫描/智能复习测验」
- **architecture.md**：关键数据流新增第 5 条「知识流水线（跨模块主链路）」
- **agent-design.md**：核心能力新增「知识库优先问答（RAG）」，明确 Agent 与知识库的衔接点
- **structure.md**：docs 目录登记 product-vision.md
- **README.md**：功能模块表按侧边栏真实顺序与命名对齐（总览/Agent/工具/文件/知识/自动/设置），知识库说明改为采集→审查→整理→检索流水线，自动化补充定时综述与智能复习；文档表补充产品总纲入口；底部路线图同步

### 决策记录
- 知识管理能力不做独立产品，而是作为 Nexus OS 知识/Agent/自动化三模块的能力血肉融入，产品总纲以 Nexus OS 为唯一主体
- 视觉语言沿用项目黑白灰极简风（不采用此前原型的青绿配色）
- 客户端形态：纯 Web + 响应式 + 移动端样式，不做独立 App/小程序

---

## 2026-08-14 — 首页全面重构与设计语言统一

### 新增

- **首页 Dashboard 全面重构** (`page.tsx`)
  - 左右分栏布局：左列 2/3 载体量内容，右列 1/3 常驻栏
  - 问候/时钟卡：时段问候语 + 公历日期星期 + 农历日期 + 实时秒钟 + 年度进度条
  - 每日一句卡：展示每日正能量引言及出处，问候卡固定 430px 后自适应拉伸
  - KPI 概览条：5 项统计指标（可用工具、已处理文件、自动化任务、知识条目、已装插件）
  - 快捷工具：从 6 个扩展到 8 个，瓦片压缩，宽屏 4 列、窄屏 3 列
  - 最新文章列表：4 篇 mock 文章，带分类标签和日期
  - 自动化任务状态卡：任务名 + 状态点 + 下次执行时间
  - 右栏常驻：AI Agent 状态卡、音乐播放器、今日待办、便签
- **音乐播放器** (`page.tsx`)
  - 黑胶唱片造型（使用 Nexus Logo），播放时旋转
  - 进度条、播放/暂停/上下曲控制
- **便签板块** (`page.tsx`)
  - 展示 3 条 mock 便签，带时间戳，右上角管理入口
- **农历与节日显示** (`page.tsx`)
  - 引入 `lunar-javascript` 库计算农历日期
  - 自动识别传统节日与节气，以黑底白字标签展示
  - 新增 `src/types/lunar-javascript.d.ts` 类型声明
- **工具中心新增工具** (`tools/page.tsx`)
  - 新增「便签」和「每日一句」两个生活类工具
  - 工具总数从 57 增至 59 个

### 修改

- **全站设计语言统一为黑白灰**
  - 主色调切换为 `#000000`，灰阶 `#666666`/`#8A8A8A`/`#999999`
  - 卡片统一使用 `rounded-[2px]` 微圆角，去除视觉差异化
  - 标题统一使用「黑色短竖条 + 黑色小标题」模式
  - 状态统一使用状态点（绿色 `#22C55E` / 灰色 `#D0D0D0`），不再使用彩色 Badge
  - 主 CTA 按钮统一为黑底白字，hover 变深灰
  - 图标块统一使用 group hover 黑白反色动效
- **PageHeader** (`page-header.tsx`)
  - 高度固定为 `h-16`
  - 增加 `sticky top-0 z-20` 吸顶效果
- **主内容区** (`layout.tsx`)
  - 设置最小宽度 900px，超出时横向滚动
- **侧边栏** (`sidebar.tsx`)
  - 移除波浪动画底部 (WaveFooter)
  - 保留涟漪点击效果
- **页脚** (`footer.tsx`)
  - 备案链接 hover 颜色由蓝色改为黑色
- **快捷工具** (`page.tsx`)
  - 瓦片压缩为 p-2，图标块 8×8，文字 13px
  - 采用灰底方案 A：工具项整体灰底，图标块白底，hover 反色
- **工具中心** (`tools/page.tsx`)
  - 修复之前方案 B 实施时导致的 JSX 损坏
  - 卡片样式统一为横向紧凑 + hover 反色
  - 去除工具名后的状态圆点
  - 分类标题改为短竖条方案 B
- **文档同步**
  - `conventions.md`：更新配色规范、组件样式规范为黑白灰语言，移除波浪动画相关描述
  - `structure.md`：更新首页描述、工具数量、新增 `src/types/` 目录

### 依赖

- 新增 `lunar-javascript` 用于农历/节日计算

### 决策记录

- 放弃蓝色主色调改用黑白灰：彩色马卡龙风格与工具页新语言割裂，黑白灰更有质感
- 首页采用左右分栏：解决大屏内容过少导致的通栏拉宽问题
- 问候卡固定 430px：日期时间内容布局稳定，不随窗口缩放错位
- 移除侧边栏波浪动画：与黑白灰设计语言融入不了
- 音乐播放器使用 Nexus Logo 替代黑胶纹理：与右下角未来浮窗形态一致

---

## 2026-08-14 — 响应式适配（侧边栏 + 工具中心）

### 修改

- **sidebar.tsx**：侧边栏响应式折叠
  - 默认宽度 `w-20`（图标导航），`2xl:` 断点展开为 `w-56`（图标 + 文字）
  - 窄屏时隐藏 Logo 文字（仅保留图标）、隐藏波浪动画
  - 导航项添加 `title` 属性，窄屏时作为 tooltip 提示
- **tools/page.tsx**：工具中心搜索栏响应式适配
  - 宽屏（`xl:`+）：保持完整胶囊样式（搜索框 + 分类标签并排）
  - 窄屏（`<xl`）：搜索收成图标按钮（点击展开/关闭），分类收成 DropdownMenu 下拉菜单
  - 引入 shadcn DropdownMenu 组件、X 和 ChevronDown 图标

### 决策记录

- 响应式断点选择：侧边栏用 `2xl`（1536px）因为侧边栏展开需要足够宽度显示文字；工具中心用 `xl`（1280px）因为分类标签较多需要更大空间
- 窄屏侧边栏不隐藏而是折叠为图标导航：保证所有功能始终可访问，同时释放主内容区空间

---

## 2026-08-14 — 工具中心重构、导航优化与文档完善

### 修改

- **tools/page.tsx**：工具中心全面重构
  - 从静态卡片展示升级为客户端交互页面（`"use client"`）
  - 工具数量从 6 个扩展至约 57 个，覆盖 7 大分类：图片、文件、文本、开发、媒体、AI、生活
  - 新增搜索框（PageHeader 右侧区域）支持工具名称/描述/分类模糊搜索
  - 新增分类标签筛选（全部 / 各分类），支持快速过滤
  - 工具按分类分组展示，每组带标题和数量标识
  - 卡片样式改为紧凑型横向布局（图标 + 名称 + 描述），开发中工具半透明显示
- **sidebar.tsx**：导航项重排
  - 导航顺序调整：总览 → Agent → 工具 → 文件 → 知识 → 自动 → 设置
  - 「首页」更名为「总览」，图标由 Home 改为 Brain
  - 「工具」图标由 Wrench 改为 Rocket
  - Agent 从第 4 位提升至第 2 位，突出 AI 能力
- **page-header.tsx**：高度固定为 `h-16`，移除纵向 padding，确保所有页面标题栏高度一致
- **globals.css**：侧边栏波浪动画速度从 3.5s/5s 调整为 5s/7s，动效更柔和
- **README.md**：添加环境要求（Node.js 18.17+）、详细安装步骤、常见问题 FAQ（pnpm 必要性、Node 版本过低报错）
- **package.json**：新增 `engines` 字段指定 Node.js 版本要求

### 决策记录

- Agent 导航提升至第二位：AI Agent 是 Nexus OS 核心差异化能力，应在导航中优先展示
- 「首页」更名「总览」：更准确反映 Dashboard 定位（系统概览而非门户首页）
- 工具中心采用客户端渲染：搜索、筛选等交互逻辑依赖浏览器状态，不适合 Server Components
- PageHeader 固定高度：避免不同页面因内容差异导致标题栏高度不一致

---

## 2026-08-14 — 字体升级与 Logo 排版优化

### 新增

- 新增本地字体目录 `src/fonts/`
  - `NotoSansSC-Variable.ttf`（思源黑体可变字体，~17MB）：用于中文正文渲染
  - `Sekuya-Regular.ttf`（装饰性英文字体，~300KB）：用于 Logo 品牌名

### 修改

- **layout.tsx**：引入 `next/font/local` 加载 NotoSansSC 和 Sekuya 字体，注册 CSS 变量 `--font-noto-sans-sc` 和 `--font-sekuya`，注入到 `<html>` 元素
- **globals.css**：全局 sans 字体回退链改为 `NotoSansSC → Geist Sans → sans-serif`，解决中文回退到系统宋体的问题
- **sidebar.tsx**：Logo 品牌名改用 Sekuya 字体，竖排双行（Nexus / OS），增加字间距，整体居中布局

### 决策记录

- 选用思源黑体作为中文字体：开源免费、可变字体体积小、显示效果清晰，与 Geist Sans 风格协调
- Logo 使用本地字体而非 Google Fonts：Sekuya 字体不在 Google Fonts 中，且本地加载更可控
- Logo 竖排双行设计：侧边栏宽度有限（w-56），竖排更紧凑美观

---

## 2026-08-14 — 项目初始化与基础框架搭建

### 技术选型

- 确定核心框架：Next.js 16.3.1 + React 19.2.8 + TypeScript 5.x
- 确定 UI 方案：Tailwind CSS 4 + shadcn/ui 4.18.0（base-nova 风格）+ Lucide React 图标
- 确定包管理器：pnpm 10.34.5，预留 workspace 支持
- 确定开发工具链：ESLint 9 + PostCSS + Geist 字体

### 基础架构

- 初始化 Next.js 项目（App Router 模式）
- 配置 TypeScript 路径别名 `@/` → `src/`
- 配置 Tailwind CSS 4 PostCSS 插件
- 配置 shadcn/ui 组件库（components.json）

### 全局布局（layout.tsx）

- 实现侧边栏 + 主内容区 + 页脚的经典布局结构
- 注入 Geist Sans + Geist Mono 字体
- 设置全局 metadata（title、description）
- 主内容区支持独立滚动，背景色 `#ECECEC`

### 公共组件

- **Sidebar**（`sidebar.tsx`）：侧边导航栏，包含 Logo、7 个路由导航项、波浪动画底部（WaveFooter）、涟漪点击效果
- **PageHeader**（`page-header.tsx`）：统一页面头部组件，支持 description 标题 + 右侧操作区
- **Footer**（`footer.tsx`）：页脚组件，版权信息 + ICP 备案 / 公安备案链接
- **LogoIcon**（`logo-icon.tsx`）：内联 SVG Logo 组件（Nexus 字母 N 造型）

### shadcn/ui 组件安装

已安装：avatar、badge、button、card、dropdown-menu、progress、switch、tabs

### 页面路由

- **首页**（`/`）：Dashboard 已完成——系统概览卡片（v0.1.0 版本号、统计数据）、AI Agent 状态卡片、快捷工具网格（6 个工具）、最近活动列表
- **工具中心**（`/tools`）：工具卡片列表展示，6 个工具（图片压缩、格式转换、OCR、以图找图、文件批处理、文本处理），标注可用/开发中状态
- **文件管理**（`/files`）：占位页面
- **AI Agent**（`/agent`）：占位页面
- **知识库**（`/knowledge`）：占位页面
- **自动化**（`/automation`）：占位页面
- **设置**（`/settings`）：框架已搭建，包含 AI 模型配置 + 工具目录两个 Card 分区

### 全局样式（globals.css）

- 配置 shadcn CSS 变量主题（light / dark 模式）
- 定义自定义动画：`wave-slide`（波浪滑动）、`ripple-expand`（涟漪扩散）
- 映射 Tailwind 主题变量（background、foreground、sidebar 等）

### 文档

- 创建 docs/ 文档目录结构
- 编写 architecture.md、conventions.md、structure.md、changelog.md、interfaces.md、roadmap.md
- 精简 README.md 为概览 + 文档链接

---

<!-- 格式参考：
## YYYY-MM-DD — 本次开发主题

### 新增
- ...

### 修改
- ...

### 修复
- ...

### 决策记录
- 描述本次开发中做出的重要技术/设计决策及原因
-->
