# 系统架构设计

本文档描述 Nexus OS 的整体架构设计、模块划分与技术选型理由。

---

## 项目愿景

Nexus OS 是一个面向个人用户打造的智能工作空间（Personal Digital Operating System），将日常工具、自动化流程、知识管理以及 AI Agent 能力整合到统一平台中。

核心理念：

> 让工具成为能力，让 AI 成为助手，让个人数据真正服务于自己。

### 解决的痛点

- 图片处理、文件管理依赖多个分散的工具
- 信息和知识散落在不同平台
- 重复性工作消耗大量时间
- AI 能力无法真正融入个人工作流

---

## 功能模块划分

```
Nexus OS
├── 工具中心（Tools）        — 图片处理、文件批处理、OCR、格式转换等效率工具
├── 文件管理（Files）        — 本地文件浏览、分类、搜索与管理
├── AI Agent（Agent）        — 智能对话、意图理解、任务规划与工具调用
├── 知识库（Knowledge）      — 个人知识沉淀、笔记管理与智能检索
├── 自动化（Automation）     — 工作流编排、定时任务与自动化流程
└── 设置（Settings）         — 系统配置、模型接入与个性化设置
```

各模块松耦合、高内聚，可独立迭代和扩展。

---

## 架构分层

```
┌─────────────────────────────────────────────┐
│                 表现层（UI）                  │
│         Next.js App Router + React 19        │
│     shadcn/ui 组件库 + Tailwind CSS 4        │
├─────────────────────────────────────────────┤
│                 业务逻辑层                    │
│   工具中心 │ AI Agent │ 知识库 │ 自动化引擎   │
├─────────────────────────────────────────────┤
│                 服务与数据层                  │
│    本地文件系统 │ 向量存储 │ 配置管理          │
└─────────────────────────────────────────────┘
```

### 表现层

- **框架**：Next.js 16 App Router，基于文件系统路由
- **渲染**：React Server Components（RSC）优先，客户端交互部分使用 Client Components
- **UI 组件**：shadcn/ui（代码直接复制到项目中，完全可控）
- **样式**：Tailwind CSS 4 原子化 CSS，通过 CSS 变量实现主题切换
- **图标**：Lucide React

### 业务逻辑层

各功能模块独立实现业务逻辑，通过 API 路由与前端通信：

- **工具中心**：注册/执行各类处理工具，管理工具生命周期
- **AI Agent**：自然语言理解 → 意图识别 → 任务规划 → 工具调用 → 结果汇总
- **知识库**：知识条目存储、向量索引、智能检索与推荐
- **自动化引擎**：工作流定义、任务调度、条件触发、执行监控

### 服务与数据层

- **本地文件系统**：文件管理、工具数据存储、配置持久化
- **向量存储**：知识库文本向量化，支持语义检索
- **配置管理**：AI 模型 API Key、工具参数、用户偏好等

---

## 技术栈

### 核心框架

| 技术 | 版本 | 说明 |
|------|------|------|
| **Next.js** | 16.3.1 | React 全栈框架，使用 App Router 架构 |
| **React** | 19.2.8 | UI 渲染引擎，支持 Server Components |
| **TypeScript** | 5.x | 类型安全，提升代码质量与开发体验 |
| **pnpm** | 10.34.5 | 高性能包管理器，支持 workspace |

### UI 与样式

| 技术 | 版本 | 说明 |
|------|------|------|
| **Tailwind CSS** | 4.x | 原子化 CSS 框架，高效构建界面 |
| **shadcn/ui** | 4.18.0 | 高质量 React 组件库（base-nova 风格） |
| **Lucide React** | 1.31.0 | 现代图标库 |
| **class-variance-authority** | 0.7.1 | 组件样式变体管理 |
| **clsx + tailwind-merge** | — | 条件类名合并与 Tailwind 类名冲突解决 |

### 开发工具链

| 工具 | 说明 |
|------|------|
| **ESLint 9** | 代码质量检查，集成 `eslint-config-next` |
| **PostCSS** | CSS 后处理，配合 Tailwind CSS 4 插件 |
| **Geist Font** | Vercel 设计的现代字体（Sans + Mono） |

### 技术选型理由

- **Next.js 16 + App Router**：支持 RSC、文件系统路由、SSR/SSG，适合构建功能丰富的 Web 应用，且具备良好的性能优化手段
- **React 19**：支持 Server Components、Actions 等新特性，提升开发效率
- **Tailwind CSS 4**：相比 v3 性能大幅提升，配置更简洁，通过 PostCSS 插件直接集成
- **shadcn/ui**：组件代码直接复制到项目中，完全可控，支持深度定制，与 Tailwind 无缝配合
- **pnpm**：安装速度快、磁盘占用小，天然支持 monorepo workspace，为未来多包架构做好准备
- **TypeScript**：全量类型覆盖，减少运行时错误，配合 Next.js 获得端到端类型安全

---

## 模型接入层（多供应商适配）

AI Agent 的模型调用不绑定单一供应商，通过「模型注册表 + 供应商适配层」两层解耦：

- **模型注册表**（`src/lib/models.ts`）：只登记模型「是什么」——项目内唯一 id、展示名、所属供应商、供应商真实模型名、能力（supportsThinking / supportsVision）。前端选择器与后端白名单都基于它。
- **供应商适配层**（`src/lib/providers/`）：只负责「怎么调」——baseURL、API Key、思考参数「方言」翻译、SSE 流式解析。核心是一个「通用 OpenAI 兼容适配器」（`openai.ts`），因为绝大多数供应商（DeepSeek / OpenRouter / 智谱 / 豆包…）都是 OpenAI 兼容格式。
- **统一入口**：后端只调用 `streamChat(modelId, ...)`，内部按模型的 `provider` 字段路由到对应适配器。

加新供应商 = 在 `providers/index.ts` 登记配置 + 在 `models.ts` 加模型条目，调用代码零改动。

---

## 数据流架构

```
用户操作（UI）
    │
    ▼
Next.js Server Actions / API Route
    │
    ▼
业务逻辑处理（工具执行 / Agent 推理 / 知识检索）
    │
    ├──► 本地文件系统（读写文件、配置）
    ├──► 向量存储（语义检索）
    └──► 外部 API（AI 模型调用）
    │
    ▼
响应返回（JSON / WebSocket 推送）
    │
    ▼
UI 更新
```

### 关键数据流场景

1. **工具执行**：用户选择工具 → 上传/选择文件 → API 调用 → 后台处理 → 返回结果
2. **AI 对话**（已实现）：用户输入 → `POST /api/chat` → 组装上下文（滑动窗口 20 轮）→ Agent Loop（流式调模型 → 执行工具 → 回传再决策，上限 5 轮）→ SSE 流式输出（含 tool_call / tool_result / tool_error）→ SQLite 落库
3. **知识检索**：用户查询 → 向量化 → 相似度匹配 → 排序返回结果
4. **自动化任务**：触发条件满足 → 加载工作流定义 → 按序执行节点 → 记录日志
5. **知识流水线（跨模块主链路）**：自动化定时触发 → 工具抓取网页 → 内容入知识库 Inbox → 人审查留弃 → Agent 调用 LLM 提炼/打标签/关联 → 落文件存储并写向量索引 → 人在知识库阅读或在 Agent 对话框经 RAG 调取 → 自动化定期出综述、推遗忘复习

---

## 当前版本状态（v0.1.0）

已完成：
- 项目初始化与技术栈搭建（Next.js 16 + React 19 + TS 5 + Tailwind 4 + pnpm）
- 全局布局（AppShell：桌面常驻侧边栏 + 移动端抽屉 + PageHeader 吸顶 + Footer）
- 公共组件（Sidebar、AppShell、PageHeader、Footer、LogoIcon）
- shadcn/ui 基础组件安装（avatar/badge/button/card/dropdown-menu/progress/switch/tabs）
- 首页 Dashboard（问候时钟、KPI、快捷工具、右栏常驻卡片等）
- 工具中心页面（59 个工具卡片、搜索筛选、三档响应式）
- AI Agent 真实对话（多模型切换、流式输出、深度思考、图片看图、SQLite 会话持久化、全局 Toast）
- AI Agent 工具调用（Agent Loop + 工具注册表 + 真实天气 Open-Meteo + 联网搜索 Tavily，真流式首字 1-2s）
- 知识库页面 UI mock（知识流/我的文章/收件箱/回收站/订阅源/自测/回顾 7 个 section，全前端交互）
- 全站响应式三档断点（移动 <1024 / 窄屏 PC 1024-1279 / 宽屏 ≥1280）
- 设置页面框架
- 所有模块路由注册

待开发（均为真实能力，当前页面为纯 mock）：
- 工具实际执行逻辑
- 文件管理功能
- AI Agent 意图理解与任务规划（工具调用已落地，见「Agent Loop」；意图理解/任务规划待做）
- 知识库数据存储、采集、AI 整理与语义检索
- 自动化工作流引擎
- 插件系统
