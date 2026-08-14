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
│   ├── layout.tsx          # 根布局：侧边栏 + 主内容区 + 页脚，全局字体与样式注入
│   ├── page.tsx            # 首页 Dashboard：系统概览、快捷工具、最近活动
│   ├── globals.css         # 全局样式：Tailwind 导入、CSS 变量（shadcn 主题）、自定义动画
│   ├── icon.svg            # 网站 favicon 图标
│   │
│   ├── tools/page.tsx      # 工具中心页面：展示所有可用工具（图片压缩、OCR 等）
│   ├── files/page.tsx      # 文件管理页面（占位，待开发）
│   ├── agent/page.tsx      # AI Agent 页面（占位，待开发）
│   ├── knowledge/page.tsx  # 知识库页面（占位，待开发）
│   ├── automation/page.tsx # 自动化页面（占位，待开发）
│   └── settings/page.tsx   # 设置页面：AI 模型配置、工具目录等（框架已搭建，功能待开发）
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
│   ├── sidebar.tsx         # 侧边导航栏：路由导航 + 波浪动画底部 + 涟漪点击效果
│   ├── page-header.tsx     # 页面头部组件：统一的页面标题栏（各页面复用）
│   ├── footer.tsx          # 页脚组件：版权信息 + ICP 备案链接
│   └── logo-icon.tsx       # Logo SVG 图标组件（内联 SVG，Nexus 字母造型）
│
├── fonts/                  # 本地字体文件
│   ├── NotoSansSC-Variable.ttf  # 思源黑体可变字体（中文正文）
│   └── Sekuya-Regular.ttf       # 装饰性英文字体（Logo 品牌名）
│
└── lib/
    └── utils.ts            # 工具函数：cn() — 合并 clsx + tailwind-merge 的类名处理
```

## docs/ — 项目文档

```
docs/
├── architecture.md         # 系统架构设计：分层架构、模块划分、数据流
├── agent-design.md         # AI Agent 设计：意图理解、任务规划、工具调用
├── interfaces.md           # 接口设计：RESTful API、WebSocket、插件 SDK 接口
├── roadmap.md              # 开发路线图：版本规划与里程碑
├── structure.md            # 项目目录结构说明（本文件）
├── conventions.md          # 开发规范：配色、组件样式、命名约定等
└── changelog.md            # 开发日志：按日期记录的变更流水账
```

## 当前各页面开发状态

| 页面 | 路由 | 状态 |
|------|------|------|
| 首页 Dashboard | `/` | ✅ 已完成（系统概览、快捷工具、最近活动） |
| 工具中心 | `/tools` | ✅ 框架完成（6 个工具卡片展示，功能待接入） |
| 文件管理 | `/files` | 🔲 占位 |
| AI Agent | `/agent` | 🔲 占位 |
| 知识库 | `/knowledge` | 🔲 占位 |
| 自动化 | `/automation` | 🔲 占位 |
| 设置 | `/settings` | 🟡 框架已搭建（AI 模型配置 + 工具目录卡片） |
