# 开发日志

按日期记录每次开发完成的改动，便于回溯项目演进历史。**最新记录在最上方**：每次开发结束后，由 AI 把当日变更插入到本文件顶部（最新日期在前）。

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
