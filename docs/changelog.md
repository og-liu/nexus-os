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
