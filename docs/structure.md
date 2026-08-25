# 项目目录结构说明

本文档描述 Nexus OS 项目中每个目录和关键文件的用途，帮助 AI 和新成员快速理解项目组织方式。

---

## 根目录

```
Nexus OS/
├── src/                    # 源代码主目录
├── public/                 # 静态资源（图片、SVG 等），Next.js 直接通过 / 路径访问
├── docs/                   # 项目文档（面向 AI 的详尽文档，用于维护和理解项目）
├── node_modules/           # 依赖包（pnpm 管理）
├── .next/                  # Next.js 构建产物（自动生成，不提交到 Git）
├── .qoder/                 # Qoder IDE 配置与知识库缓存
├── .idea/                  # JetBrains IDE 项目配置
│
├── AGENTS.md               # AI Agent 编码规则（Next.js 自动注入，勿手动删除）
├── CLAUDE.md               # Claude AI 编码规则入口，指向 AGENTS.md
├── README.md               # 项目概览（面向人类，简洁版 + 链接到 docs/）
├── components.json         # shadcn/ui 组件库配置（主题风格、CSS 变量映射等）
├── next.config.ts          # Next.js 框架配置
├── tsconfig.json           # TypeScript 编译器配置（路径别名 @/ → src/）
├── eslint.config.mjs       # ESLint 9 扁平配置（集成 eslint-config-next）
├── postcss.config.mjs      # PostCSS 配置（Tailwind CSS 4 插件）
├── package.json            # 项目元信息、脚本命令、依赖声明
├── pnpm-lock.yaml          # pnpm 锁文件（确保依赖版本一致性）
└── pnpm-workspace.yaml     # pnpm workspace 配置（为未来 monorepo 做准备）
```

## src/ — 源代码

```
src/
├── app/                    # Next.js App Router 页面与布局
│   ├── layout.tsx          # 根布局：挂载 AppShell（侧边栏+主内容+页脚），全局字体与样式注入
│   ├── page.tsx            # 首页 Dashboard：问候/时钟/农历/年度进度、每日一句、KPI 概览、快捷工具、最近活动、自动化任务、最新文章
│   ├── globals.css         # 全局样式：Tailwind 导入、CSS 变量（shadcn 主题）、自定义动画
│   ├── icon.svg            # 网站 favicon 图标
│   │
│   ├── tools/page.tsx      # 工具中心页面：客户端交互，59 个工具，搜索 + 分类筛选 + 三档响应式（宽屏内联/窄屏下拉/手机折叠）
│   ├── files/page.tsx      # 文件管理页面（占位，待开发）
│   ├── agent/page.tsx      # AI Agent 页面：真实对话（多模型+流式输出+深度思考+图片看图+语音输入+工具调用折叠卡片），左侧会话栏对齐知识页
│   ├── knowledge/page.tsx  # 知识库页面：7 个 section（知识流/我的文章/收件箱/回收站/订阅源/自测/回顾），纯前端 mock 全交互
│   ├── automation/page.tsx # 自动化页面（占位，待开发）
│   ├── settings/page.tsx   # 设置页面：AI 模型配置、工具目录等（框架已搭建，功能待开发）
│   └── api/                # API 路由（Next.js Route Handlers）
│       ├── chat/route.ts   # AI 对话：POST 接消息→落库→组装上下文→流式调模型→落库回复
│       └── sessions/       # 会话管理：列表/新建、历史/重命名/删除
│
├── components/             # React 组件
│   ├── ui/                 # shadcn/ui 基础组件（代码直接复制到项目中，完全可控）
│   │   ├── avatar.tsx      # 头像组件
│   │   ├── badge.tsx       # 徽标/标签组件
│   │   ├── button.tsx      # 按钮组件
│   │   ├── card.tsx        # 卡片组件（CardHeader / CardContent / CardTitle 等）
│   │   ├── dropdown-menu.tsx # 下拉菜单组件
│   │   ├── progress.tsx    # 进度条组件
│   │   ├── switch.tsx      # 开关组件
│   │   └── tabs.tsx        # 标签页组件
│   │
│   ├── app-shell.tsx       # 应用外壳：桌面常驻侧边栏 + 移动端抽屉（遮罩+锁背景滚动），整页 h-screen overflow-hidden
│   ├── sidebar.tsx         # 侧边导航栏：路由导航 + 涟漪点击效果，桌面 hidden lg:flex / 移动抽屉，导航顺序总览/Agent/知识/工具/文件/自动/设置
│   ├── page-header.tsx     # 页面头部组件：吸顶 h-16，手机汉堡+短标题 / 桌面完整标题，右侧操作区插槽
│   ├── footer.tsx          # 页脚组件：版权信息 + ICP/公安备案链接，移动端竖排/桌面横排
│   ├── logo-icon.tsx       # Logo SVG 图标组件（内联 SVG，Nexus 字母造型）
│   └── toast.tsx           # 全局提示组件：统一屏幕居中、放大，info/warn/error 三级，3 秒自动消失
│
├── fonts/                  # 本地字体文件
│   ├── NotoSansSC-Variable.ttf  # 思源黑体可变字体（中文正文）
│   └── Sekuya-Regular.ttf       # 装饰性英文字体（Logo 品牌名）
│
├── types/                  # TypeScript 类型声明
│   └── lunar-javascript.d.ts  # lunar-javascript 库的类型补充声明
│
└── lib/
    ├── utils.ts            # 工具函数：cn() — 合并 clsx + tailwind-merge 的类名处理
    ├── models.ts           # 模型注册表：模型元信息（id/供应商/能力），前端选择器与后端白名单共用
    ├── db.ts               # SQLite 访问：getDb() 连接，sessions/messages 表操作；messages 含 tool_calls/reasoning/usage 字段（工具调用、思考过程、token 用量持久化），内置幂等迁移自动补列
    ├── agent/              # Agent Loop 核心（工具调用编排）
    │   ├── loop.ts         # Agent 循环：流式调模型 → 拼接 tool_calls → 执行工具 → 回传再决策
    │   └── tools.ts        # 工具注册表：天气 get_weather / 搜索 web_search + buildToolsSchema/getTool
    ├── search/             # 联网搜索抽象层
    │   ├── types.ts        # SearchProvider 接口 + SearchResult 类型
    │   ├── tavily.ts       # Tavily 实现（15s 超时、6 条结果、正文截断）
    │   └── index.ts        # 工厂函数：按 SEARCH_PROVIDER 环境变量选择供应商
    └── providers/          # 供应商适配层（模型接入开放化核心）
        ├── types.ts        # 共享类型：ChatMessage/ChatContentPart/ThinkingOptions/ProviderConfig
        ├── openai.ts       # 通用 OpenAI 兼容流式调用（baseURL/key/模型名可配置、SSE 解析）
        └── index.ts        # 供应商登记表（deepseek/openrouter）+ 统一 streamChat 入口
```

## docs/ — 项目文档

```
docs/
├── product-vision.md       # 产品总纲：定位、理念、模块能力地图、产品阶段路线（唯一产品真相源）
├── architecture.md         # 系统架构设计：分层架构、模块划分、数据流
├── agent-design.md         # AI Agent 设计：意图理解、任务规划、工具调用
├── interfaces.md           # 接口设计：RESTful API、WebSocket、插件 SDK 接口
├── structure.md            # 项目目录结构说明（本文件）
├── conventions.md          # 开发规范：配色、组件样式、命名约定等
├── tools.md                # 工具系统：架构 / 天气 / 搜索抽象层 / Loop 机制 / SSE 事件 / 前端展示 / 加新工具步骤
└── changelog.md            # 开发日志：按日期记录的变更流水账
```

## 当前各页面开发状态

| 页面 | 路由 | 状态 |
|------|------|------|
| 首页 Dashboard | `/` | ✅ 已完成（问候/时钟/农历/年度进度、每日一句、KPI、快捷工具、最近活动、自动化任务、最新文章、AI Agent、音乐播放器、便签、待办） |
| AI Agent | `/agent` | ✅ 真实对话已实现（多模型切换、流式输出、深度思考、图片看图、SQLite 会话持久化、工具调用——天气/联网搜索、工具调用/思考过程/token 用量落库还原；意图理解/任务规划待开发） |
| 知识库 | `/knowledge` | 🟡 UI mock 已完成（知识流/我的文章/收件箱/回收站/订阅源/自测闪卡选择题/回顾统计，全前端交互；无真实存储/AI 加工/检索） |
| 工具中心 | `/tools` | ✅ 页面已完成（59 个工具卡片、搜索 + 分类筛选、三档响应式；工具均为 mock 无实际执行） |
| 文件管理 | `/files` | 🔲 占位 |
| 自动化 | `/automation` | 🔲 占位 |
| 设置 | `/settings` | 🟡 框架已搭建（AI 模型配置 + 工具目录卡片） |
