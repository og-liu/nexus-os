import {
  AudioLines,
  Braces,
  CalendarDays,
  CheckSquare,
  Download,
  FileCode,
  Image,
  Music,
  NotepadText,
  Vault,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 工具目录（《功能/工具中心》§三）。
 *
 * **只收真能用的工具**（2026-10-30 起）：这里曾经是 60 条——当时 5 个真工具 + 55 条
 * 占位条目。占位条目点进去只有一句「该工具开发中...」，对用户是一次白跑，
 * 对目录是一次撒谎：卡片长得一模一样，看不出哪个能用。
 * 现在是 10 个真工具、一条占位都没有。
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
 * 分类条**只收当前有货的分类**（2026-11-03 起）。
 *
 * 曾经的规矩是「分类是产品路线图，空着也留着」——用它替「以后要不要做这一类」
 * 占个位。实行下来两个空分类各挂了几个月，一个工具都没长出来：「AI」这一类
 * （扩图 / 晨报 / 转文字）逐个评估后全部暂不实现，「文件」也没有具体计划。
 * 空分类于是从路线图变成了永远空的货架——用户点进去只看到「这一类还没有可用的
 * 工具」，会以为东西丢了，而不是还没做。
 *
 * 现在的规矩：**有工具才有分类**。加分类的唯一时机是加第一个属于它的工具，
 * 数组顺序就是分类条上的位置。要重启某条线，先做出工具，再把分类加回来。
 */
export const TOOL_CATEGORIES = [
  "图片",
  "文本",
  "开发",
  "媒体",
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

/** 十个真工具。顺序即「全部」视图里的展示顺序（图片 → 文本 → 生活 → 开发 → 媒体）。 */
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
  {
    slug: "markdown-editor",
    name: "Markdown 编辑器",
    description: "实时预览与快捷编辑",
    icon: FileCode,
    status: "可用",
    category: "开发",
  },
  {
    slug: "html-editor",
    name: "HTML 编辑器",
    description: "源码编辑与沙箱预览",
    icon: Braces,
    status: "可用",
    category: "开发",
  },
  {
    slug: "audio-extract",
    name: "音频提取",
    description: "从视频里把声音原样提出来，能无损就不转码",
    icon: Music,
    status: "可用",
    category: "媒体",
  },
  {
    slug: "douyin-download",
    name: "抖音下载",
    description: "贴一条分享链接，把无水印视频存下来",
    icon: Download,
    status: "可用",
    category: "媒体",
  },
  {
    slug: "music-player",
    name: "音乐播放器",
    description: "把自己的音频传成曲库，切页面也不停地放",
    icon: AudioLines,
    status: "可用",
    category: "媒体",
  },
];

/** 按 slug 精确查找（大小写敏感）；找不到返回 undefined，由页面决定走 404。 */
export function findToolBySlug(slug: string): Tool | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}
