# 开发日志

按日期记录每次开发完成的改动，便于回溯项目演进历史。每次开发结束后由 AI 总结当日所有变更并追加到本文件。

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
