# 开发规范

本文档记录 Nexus OS 项目中需要遵循的开发规范与约定，确保代码风格一致、组件可维护。AI 在编写代码时应优先参考本文档。

---

## 配色规范

项目采用**黑白灰**为主的设计语言（v0.1.0 中期由蓝色主色调演进而来），色彩仅保留给「状态」表达：

### 主色体系

| 用途 | 色值 | 说明 |
|------|------|------|
| 主黑 | `#000000` | 标题、主 CTA 按钮底色、选中态底色、短竖条标题装饰 |
| 主黑悬停 | `#333333` | 黑色按钮的 hover 状态 |
| 图标黑 | `#1F1F1F` | 卡片内工具/活动图标 |
| 次要文字 | `#666666` | 可交互的次级图标/文字 |
| 辅助文字 | `#8A8A8A` | 描述、标签文字 |
| 弱化文字 | `#999999` | 时间戳、计数、占位符 |
| 导航激活背景 | `#d5e3f6` | 侧边栏当前路由高亮背景（侧边栏保留的唯一彩色元素） |
| 导航悬停背景 | `#ededed` | 侧边栏非激活项的 hover 背景 |

### 状态色（仅用于状态点）

| 语义 | 色值 | 使用场景 |
|------|------|----------|
| 正常/运行中 | `#22C55E` | 自动化任务运行状态点 |
| 未配置/已暂停 | `#D0D0D0` | AI Agent 未配置、任务暂停状态点 |

状态点统一为 `h-1.5 w-1.5 rounded-full` 圆点 + 灰色文字说明，**不使用彩色 Badge 徽章**。

### 背景色

| 用途 | 色值 |
|------|------|
| 页面整体背景 | `#F5F7FA`（body） |
| 主内容区背景 | `#ECECEC` |
| 侧边栏背景 | `#F5F5F5` |
| 页脚背景 | `#ECECEC` |
| 卡片背景 | `#FFFFFF`（白卡片） |
| 卡片内嵌块 | `#F5F5F5`（白卡片内的统计块/工具块/图标底） |
| 头部控件容器 | `#ECECEC`（PageHeader 右侧胶囊容器） |

层次规则：**灰页面 → 白卡片 → 灰内嵌块 → 白图标底**，相邻层级底色交替，不使用投影区分层次。

### 边框与分隔线

| 用途 | 色值 |
|------|------|
| 侧边栏右边框 | `#E5E5E5` |
| PageHeader 下边框 | `#E8E8E8` |
| 列表分隔线 / KPI 分隔线 | `#F0F0F0`（`divide-y` / `divide-x`） |

---

## 组件样式规范

### 圆角

全站统一使用 **2px 微圆角**（`rounded-[2px]`），适用于卡片、按钮、输入框、图标底块等一切矩形容器。例外：状态点、黑胶唱片、圆形播放按钮等本身为圆形的元素使用 `rounded-full`。

### 卡片

业务卡片**不使用 shadcn Card 组件**，直接使用原生 div：

```tsx
<div className="rounded-[2px] bg-white p-5">
```

- 无边框、无投影，靠底色层次区分
- 可交互卡片（如工具卡）hover 态：`hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]`

### 短竖条标题（SectionTitle）

卡片/分组标题统一使用「黑色短竖条 + 黑色小标题」模式：

```tsx
<div className="flex items-center gap-2">
  <div className="h-3.5 w-[3px] bg-[#000000]" />
  <h2 className="text-sm font-semibold text-[#000000]">标题</h2>
</div>
```

可在右侧追加灰色计数（`text-xs text-[#999999]`）或「查看全部」链接。

### 主 CTA 按钮

页面主操作按钮统一黑底白字：

```tsx
className="rounded-[2px] bg-[#000000] text-white hover:bg-[#333333]"
```

### hover 反色动效

可点击的图标块统一使用 group hover 反色：常态灰底（`bg-[#F5F5F5]` 或白底）黑图标，hover 时黑底白图标：

```tsx
<div className="group ...">
  <div className="bg-[#F5F5F5] transition-colors group-hover:bg-[#000000]">
    <Icon className="text-[#1F1F1F] transition-colors group-hover:text-white" />
  </div>
</div>
```

### PageHeader 组件

每个页面**必须**使用统一的 `PageHeader` 组件作为页面标题栏：

```tsx
import { PageHeader } from "@/components/page-header";

<PageHeader description="页面描述文案">
  {/* 可选：右侧操作区（搜索框、筛选等） */}
</PageHeader>
```

- `description` 属性为页面标题（必填）
- `children` 为右侧操作区域（可选）
- 标题栏固定高度 `h-16`，所有页面保持一致
- 不要在页面中自行实现标题栏

### 状态标识

工具/功能/任务的状态展示使用**状态点**统一模式（不使用彩色 Badge）：

- **正常/运行中**：`<span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />`
- **未配置/已暂停**：`<span className="h-1.5 w-1.5 rounded-full bg-[#D0D0D0]" />`
- 开发中的工具卡片使用整体降透明度表达：`opacity-60 hover:opacity-100`

### 图标

统一使用 **Lucide React** 图标库，不引入其他图标库。

```tsx
import { Wrench, Bot, BookOpen } from "lucide-react";
```

---

## 侧边栏导航顺序

| 序号 | 路由 | 标签 | 图标 |
|------|------|------|------|
| 1 | `/` | 总览 | Brain |
| 2 | `/agent` | Agent | Bot |
| 3 | `/knowledge` | 知识 | BookOpen |
| 4 | `/tools` | 工具 | Rocket |
| 5 | `/files` | 文件 | FolderOpen |
| 6 | `/automation` | 自动 | Zap |
| 7 | `/settings` | 设置 | Settings |

## 布局规范

### 整体布局

采用经典侧边栏布局（在 `app-shell.tsx` 中定义），整页 `h-screen overflow-hidden`：

```
┌──────────┬─────────────────────────┐
│          │   PageHeader (h-16 吸顶) │
│  侧边栏   ├─────────────────────────┤
│ (w-56)   │       主内容区            │
│ 常驻/抽屉 │  (overflow-y-auto)      │
│          ├─────────────────────────┤
│          │       页脚 (Footer)      │
└──────────┴─────────────────────────┘
```

- 桌面端侧边栏常驻（`hidden lg:flex`），移动端为左侧抽屉（汉堡按钮触发，遮罩锁背景滚动）
- 主内容区 `<main className="flex-1 overflow-y-auto bg-[#ECECEC]">`
- PageHeader `sticky top-0 z-20 h-16`，手机端显示短标题（`lg:hidden`），桌面端显示完整标题（`hidden lg:inline`）

### 页面内容区

- 普通页面内容统一 `px-4 py-4 md:px-6 md:py-6`
- 满高型页面（Agent 对话、知识页）使用 `h-[calc(100%-4rem)]` 占满 header 以下区域，左右栏各自 `overflow-y-auto`
- 内容容器**不设 max-width 限宽**，100% 铺满内容区仅留内边距；消息气泡等内部元素可用 `max-w-[70%]` / `max-w-[85%]` 自适应
- 板块间距用 `space-y-4`（Dashboard）或 `space-y-8`（工具中心分组），网格间隙统一 `gap-3` / `gap-4`

### 侧边栏子页面同构规范

Agent 页与知识页都使用**页面内左侧栏 + 主内容**的二级布局，二者必须保持视觉一致：

- 左栏宽度 `w-[260px]`，满高 `overflow-y-auto`
- 顶部通栏黑底按钮（Agent："新对话"；知识："采集内容"，带红点提示）
- 导航项双行结构：主行（图标 + 标题 + badge/计数）+ 次行（`pl-6` 灰色描述，12px）
- 底部 `border-t` 统计区：小标题（图标 + 文字）+ 白底卡片（主行粗体 + 次行灰色 + 状态胶囊/进度条）

### 占位页面

尚未开发的功能页面使用统一的占位样式：

```tsx
<div className="rounded-lg border border-dashed border-border bg-white p-12 text-center">
  <p className="text-sm text-muted-foreground">XXX功能开发中...</p>
</div>
```

### 响应式策略

项目采用 Tailwind CSS 内置断点，核心分界为 **lg（1024px）**，分三档：

| 档位 | 宽度 | 典型设备 | 布局 |
|------|------|----------|------|
| 移动 | < 1024px | 手机、iPad 竖屏（768-1023） | 抽屉导航 + 移动控件 |
| 窄屏 PC | 1024-1279px | iPad 横屏、小笔记本 | 常驻侧边栏 + 紧凑控件 |
| 宽屏 PC | ≥ 1280px | 桌面显示器 | 完整搜索栏、网格多列 |

**断点使用约定（重要）**：

- **结构性布局类**（控制显隐/排列方向/宽度，如 `hidden`/`flex`/`flex-row`/`flex-col`/`w-[260px]`）统一用 `lg:` 前缀，在 1024px 处切换 PC/移动布局
- **字号、间距、内边距类**（`text-`/`px-`/`py-`/`gap-`/`truncate`）保留 `md:`（768px 即生效），保证平板文字密度
- **xl:（1280px）**仅用于宽屏增量增强（如工具中心完整搜索栏、网格列数），不做基础显隐分界

**侧边栏响应式规则**：

| 状态 | 断点 | 表现 |
|------|------|------|
| 移动 | < lg（1024） | 汉堡按钮触发左侧抽屉（w-64），遮罩 + 锁背景滚动 |
| 桌面 | ≥ lg（1024） | 常驻 `w-56`，图标 + 文字 |

**工具中心搜索栏**：

| 状态 | 搜索 | 分类筛选 |
|------|------|----------|
| < xl（1280） | 图标按钮（点击展开） | DropdownMenu 下拉菜单 |
| ≥ xl（1280） | 内联搜索框 | 标签按钮并排显示 |

---

## 命名约定

### 文件命名

| 类型 | 规范 | 示例 |
|------|------|------|
| 页面文件 | Next.js App Router 约定 | `page.tsx` |
| 组件文件 | kebab-case | `page-header.tsx`、`logo-icon.tsx` |
| UI 组件 | kebab-case（shadcn 规范） | `dropdown-menu.tsx` |
| 工具函数 | camelCase 导出 | `cn()` |

### CSS 类名

- 统一使用 **Tailwind CSS** 工具类，不编写自定义 CSS（`globals.css` 除外）
- 条件类名使用 `cn()` 函数（来自 `@/lib/utils`）：

```tsx
import { cn } from "@/lib/utils";

className={cn("基础样式", isActive && "激活样式")}
```

### 路径别名

使用 `@/` 指向 `src/` 目录（在 `tsconfig.json` 中配置）：

```tsx
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
```

---

## 技术约定

### React 组件

- 使用**函数组件** + **箭头函数导出**（命名导出，非默认导出）
- 页面组件使用默认导出（Next.js App Router 约定）
- 客户端组件需在文件顶部添加 `"use client"` 指令

### shadcn/ui 组件

- 通过 `npx shadcn@latest add <组件名>` 安装
- 组件代码直接存在于 `src/components/ui/` 中，可自由修改
- 主题风格为 **base-nova**，通过 `components.json` 配置

### Logo 与 Favicon

- Logo 采用**内联 SVG** 组件（`logo-icon.tsx`），不使用图片文件
- Favicon 使用 SVG 文件（`icon.svg`），不使用 PNG/ICO

### 字体

| 字体 | 加载方式 | CSS 变量 | 用途 |
|------|----------|----------|------|
| Noto Sans SC | `next/font/local`（本地 TTF） | `--font-noto-sans-sc` | 中文正文（优先级最高） |
| Geist Sans | `next/font/google` | `--font-geist-sans` | 英文正文（中文回退后的第二选择） |
| Geist Mono | `next/font/google` | `--font-geist-mono` | 代码/等宽文本 |
| Sekuya | `next/font/local`（本地 TTF） | `--font-sekuya` | Logo 品牌名（装饰性字体） |

全局字体回退链（在 `globals.css` 中定义）：

```css
--font-sans: var(--font-noto-sans-sc), var(--font-geist-sans), sans-serif;
```

- 中文文本优先使用思源黑体，英文文本回退到 Geist Sans
- Logo 品牌名使用 Sekuya 字体，通过内联 style 指定 `fontFamily: 'var(--font-sekuya)'`
