# 开发规范

本文档记录 Nexus OS 项目中需要遵循的开发规范与约定，确保代码风格一致、组件可维护。AI 在编写代码时应优先参考本文档。

---

## 配色规范

项目采用统一的品牌色与语义色体系：

### 品牌色

| 用途 | 色值 | 说明 |
|------|------|------|
| 主色调 | `#1890FF` | 按钮、链接、图标高亮、导航激活态 |
| 主色悬停 | `#40a9ff` | 主色调的 hover 状态 |
| 导航激活背景 | `#d5e3f6` | 侧边栏当前路由高亮背景 |
| 导航悬停背景 | `#ededed` | 侧边栏非激活项的 hover 背景 |

### 语义色（工具/状态标识）

| 语义 | Tailwind 类 | 使用场景 |
|------|-------------|----------|
| 蓝色（信息） | `text-blue-500` / `bg-blue-50` | 图片压缩等工具图标 |
| 绿色（成功） | `text-green-500` / `bg-green-50` | OCR 识别、可用状态 |
| 紫色（搜索） | `text-purple-500` / `bg-purple-50` | 以图找图等 |
| 橙色（警告） | `text-orange-500` / `bg-orange-50` | 文件批处理、自动化 |
| 粉色（转换） | `text-pink-500` / `bg-pink-50` | 格式转换 |
| 青色（文本） | `text-cyan-500` / `bg-cyan-50` | 文本处理 |

### 背景色

| 用途 | 色值 |
|------|------|
| 页面整体背景 | `#F5F7FA`（body） |
| 主内容区背景 | `#ECECEC` |
| 侧边栏背景 | `#F5F5F5` |
| 页脚背景 | `#ECECEC` |
| 统计卡片蓝 | `#F0F9FF` |
| 统计卡片绿 | `#F6FDF6` |
| 统计卡片橙 | `#FFF7F0` |
| 活动列表项背景 | `#F8FAFC` |

### 边框色

| 用途 | 色值 |
|------|------|
| 侧边栏右边框 | `#E5E5E5` |
| PageHeader 下边框 | `#E8E8E8` |

---

## 组件样式规范

### Card 组件

所有业务卡片统一使用无边框 + 轻投影样式：

```tsx
<Card className="border-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
```

悬停态可追加：

```tsx
className="border-0 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow"
```

### PageHeader 组件

每个页面**必须**使用统一的 `PageHeader` 组件作为页面标题栏：

```tsx
import { PageHeader } from "@/components/page-header";

<PageHeader description="页面描述文案">
  {/* 可选：右侧操作区 */}
</PageHeader>
```

- `description` 属性为页面标题（必填）
- `children` 为右侧操作区域（可选）
- 不要在页面中自行实现标题栏

### 状态标签

工具/功能的状态展示使用统一模式：

- **可用**：`bg-green-50 text-green-600`
- **开发中**：`bg-gray-100 text-gray-500`
- **AI Agent 就绪**：`bg-green-50 text-green-600`（Badge 组件）

### 图标

统一使用 **Lucide React** 图标库，不引入其他图标库。

```tsx
import { Wrench, Bot, BookOpen } from "lucide-react";
```

---

## 布局规范

### 整体布局

采用经典侧边栏布局（在 `layout.tsx` 中定义）：

```
┌──────────┬─────────────────────────┐
│          │       主内容区            │
│  侧边栏   │  (overflow-y-auto)      │
│  (w-56)  │                         │
│          ├─────────────────────────┤
│          │       页脚 (Footer)      │
└──────────┴─────────────────────────┘
```

### 页面内容区

各页面内容统一使用以下间距：

```tsx
<div className="space-y-6 px-6 py-4">
  {/* 页面内容 */}
</div>
```

### 占位页面

尚未开发的功能页面使用统一的占位样式：

```tsx
<div className="rounded-lg border border-dashed border-border bg-white p-12 text-center">
  <p className="text-sm text-muted-foreground">XXX功能开发中...</p>
</div>
```

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
