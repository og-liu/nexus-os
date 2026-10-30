import {
  CalendarDays,
  CheckSquare,
  Image,
  NotepadText,
  Vault,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 工具目录（《功能/工具中心》§三）。
 *
 * **只收真能用的工具**（2026-10-30 起）：这里曾经是 60 条——5 个真工具 + 55 条从旧界面
 * 搬来的占位条目。占位条目点进去只有一句「该工具开发中...」，对用户是一次白跑，
 * 对目录是一次撒谎：卡片长得一模一样，看不出哪个能用。
 *
 * 现在的规矩：**工具没实现就不进目录**。要加工具，先把工具做出来，最后一步再来这里登记
 * （工具卡、`tab-routes` 白名单、`/tools/<slug>` 路由三处一起加）。
 *
 * 当前是**前端静态数据**，因此住在组件层而不是 `lib/`：数据里带着 React 组件引用
 * （Lucide 图标），而 `lib/` 的红线是不许 import 组件。
 * 将来工具目录进数据库时：数据访问进 `lib/tools/`，本文件改为从那里读取，组件不动。
 */

export type ToolStatus = "可用" | "开发中";

/**
 * 分类是**产品路线图**，不是「当前有货的货架」。
 *
 * 七个分类都留着，哪怕其中五个现在一个工具都没有——分类筛选条上仍然能选它们，
 * 选到空分类时内容区给一句占位提示（见 `tools-view.tsx`）。删分类等于顺手把
 * 「以后要不要做文件类 / AI 类工具」这个决定也删了。
 */
export const TOOL_CATEGORIES = [
  "图片",
  "文件",
  "文本",
  "开发",
  "媒体",
  "AI",
  "生活",
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export interface Tool {
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
  status: ToolStatus;
  category: ToolCategory;
}

/** 五个真工具。顺序即「全部」视图里的展示顺序（图片 → 文本 → 生活）。 */
export const TOOLS: Tool[] = [
  {
    slug: "image-compress",
    name: "图片压缩",
    description: "智能压缩图片体积，保持画质",
    icon: Image,
    status: "可用",
    category: "图片",
  },
  {
    slug: "todo-list",
    name: "待办清单",
    description: "简单任务管理",
    icon: CheckSquare,
    status: "可用",
    category: "文本",
  },
  {
    slug: "sticky-notes",
    name: "便签",
    description: "随手贴便签，首页常驻展示",
    icon: NotepadText,
    status: "可用",
    category: "文本",
  },
  {
    slug: "attendance-calendar",
    name: "工作日历",
    description: "单休 / 双休 / 单双休自动推算，每天上班还是休息一眼看清",
    icon: CalendarDays,
    status: "可用",
    category: "生活",
  },
  {
    slug: "vault",
    name: "保险库",
    description: "存账号、密码和任何需要记住的键值记录，按群组归类",
    icon: Vault,
    status: "可用",
    category: "生活",
  },
];

/** 按 slug 精确查找（大小写敏感）；找不到返回 undefined，由页面决定走 404。 */
export function findToolBySlug(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}
