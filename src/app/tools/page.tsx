"use client";

import { useState, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  X,
  ChevronDown,
  Image,
  Images,
  Scissors,
  Sticker,
  LayoutGrid,
  Film,
  ZoomIn,
  Palette,
  Globe,
  ScanLine,
  QrCode,
  FolderOpen,
  CopyX,
  HardDrive,
  FolderX,
  FilePenLine,
  FolderTree,
  FileSearch,
  Lock,
  FileText,
  FileCode,
  Braces,
  Split,
  Binary,
  Hash,
  Fingerprint,
  KeyRound,
  GitCompare,
  TypeOutline,
  Clock,
  CalendarClock,
  BadgeCheck,
  Database,
  Code,
  Send,
  Bookmark,
  Music,
  Clapperboard,
  Video,
  AudioLines,
  Mic,
  Volume2,
  ScrollText,
  Languages,
  FileQuestion,
  UsersRound,
  Mail,
  Clipboard,
  StickyNote,
  CheckSquare,
  CalendarCheck,
  Receipt,
  BookMarked,
  Contact,
  NotepadText,
  Quote,
} from "lucide-react";

type ToolStatus = "可用" | "开发中";

interface Tool {
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  status: ToolStatus;
  category: string;
}

const categories = ["全部", "图片", "文件", "文本", "开发", "媒体", "AI", "生活"];

const tools: Tool[] = [
  {
    name: "图片压缩",
    description: "智能压缩图片体积，保持画质",
    icon: Image,
    color: "text-blue-500",
    bg: "bg-blue-50",
    status: "可用",
    category: "图片",
  },
  {
    name: "图片格式转换",
    description: "PNG、JPG、WebP 等格式互转",
    icon: Images,
    color: "text-pink-500",
    bg: "bg-pink-50",
    status: "可用",
    category: "图片",
  },
  {
    name: "智能抠图",
    description: "一键去除图片背景",
    icon: Scissors,
    color: "text-purple-500",
    bg: "bg-purple-50",
    status: "开发中",
    category: "图片",
  },
  {
    name: "图片水印",
    description: "批量添加文字或图片水印",
    icon: Sticker,
    color: "text-indigo-500",
    bg: "bg-indigo-50",
    status: "开发中",
    category: "图片",
  },
  {
    name: "图片拼接",
    description: "横拼、竖拼、九宫格",
    icon: LayoutGrid,
    color: "text-cyan-500",
    bg: "bg-cyan-50",
    status: "开发中",
    category: "图片",
  },
  {
    name: "GIF 制作",
    description: "图片或视频转 GIF",
    icon: Film,
    color: "text-rose-500",
    bg: "bg-rose-50",
    status: "开发中",
    category: "图片",
  },
  {
    name: "图片放大",
    description: "AI 超分辨率放大",
    icon: ZoomIn,
    color: "text-amber-500",
    bg: "bg-amber-50",
    status: "开发中",
    category: "图片",
  },
  {
    name: "取色器",
    description: "从图片提取主色与调色板",
    icon: Palette,
    color: "text-violet-500",
    bg: "bg-violet-50",
    status: "开发中",
    category: "图片",
  },
  {
    name: "Favicon 生成",
    description: "一键生成多尺寸网站图标",
    icon: Globe,
    color: "text-emerald-500",
    bg: "bg-emerald-50",
    status: "开发中",
    category: "图片",
  },
  {
    name: "截图 OCR",
    description: "截图后直接识别文字",
    icon: ScanLine,
    color: "text-green-500",
    bg: "bg-green-50",
    status: "可用",
    category: "图片",
  },
  {
    name: "二维码工具",
    description: "生成或解析二维码",
    icon: QrCode,
    color: "text-slate-500",
    bg: "bg-slate-50",
    status: "开发中",
    category: "图片",
  },
  {
    name: "以图找图",
    description: "在目录中定位相似图片",
    icon: Search,
    color: "text-fuchsia-500",
    bg: "bg-fuchsia-50",
    status: "开发中",
    category: "图片",
  },
  {
    name: "文件批量处理",
    description: "批量重命名、移动、转换",
    icon: FolderOpen,
    color: "text-orange-500",
    bg: "bg-orange-50",
    status: "开发中",
    category: "文件",
  },
  {
    name: "重复文件清理",
    description: "按哈希查找并清理重复文件",
    icon: CopyX,
    color: "text-red-500",
    bg: "bg-red-50",
    status: "开发中",
    category: "文件",
  },
  {
    name: "大文件扫描",
    description: "快速定位空间占用大户",
    icon: HardDrive,
    color: "text-teal-500",
    bg: "bg-teal-50",
    status: "开发中",
    category: "文件",
  },
  {
    name: "空文件夹清理",
    description: "一键删除空文件夹",
    icon: FolderX,
    color: "text-gray-500",
    bg: "bg-gray-50",
    status: "开发中",
    category: "文件",
  },
  {
    name: "文件重命名",
    description: "支持正则与序号规则",
    icon: FilePenLine,
    color: "text-sky-500",
    bg: "bg-sky-50",
    status: "开发中",
    category: "文件",
  },
  {
    name: "文件自动分类",
    description: "按日期、类型、扩展名整理",
    icon: FolderTree,
    color: "text-lime-500",
    bg: "bg-lime-50",
    status: "开发中",
    category: "文件",
  },
  {
    name: "文件内容搜索",
    description: "全文检索文件内容",
    icon: FileSearch,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
    status: "开发中",
    category: "文件",
  },
  {
    name: "文件加密",
    description: "本地文件加密与解密",
    icon: Lock,
    color: "text-zinc-600",
    bg: "bg-zinc-100",
    status: "开发中",
    category: "文件",
  },
  {
    name: "文本处理",
    description: "编码转换、大小写、格式清理",
    icon: FileText,
    color: "text-cyan-500",
    bg: "bg-cyan-50",
    status: "可用",
    category: "文本",
  },
  {
    name: "Markdown 编辑器",
    description: "实时预览与快捷编辑",
    icon: FileCode,
    color: "text-neutral-600",
    bg: "bg-neutral-100",
    status: "开发中",
    category: "文本",
  },
  {
    name: "JSON 工具",
    description: "格式化、校验、压缩",
    icon: Braces,
    color: "text-green-600",
    bg: "bg-green-50",
    status: "开发中",
    category: "文本",
  },
  {
    name: "正则测试",
    description: "在线编写与测试正则",
    icon: Split,
    color: "text-orange-600",
    bg: "bg-orange-50",
    status: "开发中",
    category: "文本",
  },
  {
    name: "Base64 编解码",
    description: "文本与文件 Base64 转换",
    icon: Binary,
    color: "text-blue-600",
    bg: "bg-blue-50",
    status: "开发中",
    category: "文本",
  },
  {
    name: "哈希计算",
    description: "MD5、SHA 系列哈希",
    icon: Hash,
    color: "text-stone-600",
    bg: "bg-stone-100",
    status: "开发中",
    category: "文本",
  },
  {
    name: "UUID 生成",
    description: "生成唯一标识符",
    icon: Fingerprint,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    status: "开发中",
    category: "文本",
  },
  {
    name: "密码生成",
    description: "高强度随机密码",
    icon: KeyRound,
    color: "text-red-600",
    bg: "bg-red-50",
    status: "开发中",
    category: "文本",
  },
  {
    name: "文本对比",
    description: "两段文本差异对比",
    icon: GitCompare,
    color: "text-violet-600",
    bg: "bg-violet-50",
    status: "开发中",
    category: "文本",
  },
  {
    name: "字数统计",
    description: "字数、字符、阅读时间",
    icon: TypeOutline,
    color: "text-pink-600",
    bg: "bg-pink-50",
    status: "开发中",
    category: "文本",
  },
  {
    name: "Cron 解析",
    description: "Cron 表达式翻译与校验",
    icon: Clock,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    status: "开发中",
    category: "开发",
  },
  {
    name: "时间戳转换",
    description: "Unix 与本地时间互转",
    icon: CalendarClock,
    color: "text-blue-700",
    bg: "bg-blue-50",
    status: "开发中",
    category: "开发",
  },
  {
    name: "JWT 解析",
    description: "解析与验证 JWT Token",
    icon: BadgeCheck,
    color: "text-amber-600",
    bg: "bg-amber-50",
    status: "开发中",
    category: "开发",
  },
  {
    name: "SQL 格式化",
    description: "SQL 美化与压缩",
    icon: Database,
    color: "text-slate-600",
    bg: "bg-slate-100",
    status: "开发中",
    category: "开发",
  },
  {
    name: "HTML 格式化",
    description: "HTML / XML 美化",
    icon: Code,
    color: "text-purple-700",
    bg: "bg-purple-50",
    status: "开发中",
    category: "开发",
  },
  {
    name: "颜色转换",
    description: "HEX、RGB、HSL 互转",
    icon: Palette,
    color: "text-rose-600",
    bg: "bg-rose-50",
    status: "开发中",
    category: "开发",
  },
  {
    name: "API 请求测试",
    description: "轻量 HTTP 接口调试",
    icon: Send,
    color: "text-sky-600",
    bg: "bg-sky-50",
    status: "开发中",
    category: "开发",
  },
  {
    name: "代码片段",
    description: "收藏与管理常用代码",
    icon: Bookmark,
    color: "text-yellow-700",
    bg: "bg-yellow-50",
    status: "开发中",
    category: "开发",
  },
  {
    name: "音频转换",
    description: "MP3、WAV、FLAC 互转",
    icon: Music,
    color: "text-fuchsia-600",
    bg: "bg-fuchsia-50",
    status: "开发中",
    category: "媒体",
  },
  {
    name: "视频转 GIF",
    description: "视频片段转动画",
    icon: Clapperboard,
    color: "text-red-700",
    bg: "bg-red-50",
    status: "开发中",
    category: "媒体",
  },
  {
    name: "视频压缩",
    description: "降低视频体积",
    icon: Video,
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    status: "开发中",
    category: "媒体",
  },
  {
    name: "音频提取",
    description: "从视频中提取音频",
    icon: AudioLines,
    color: "text-cyan-700",
    bg: "bg-cyan-50",
    status: "开发中",
    category: "媒体",
  },
  {
    name: "录音机",
    description: "快速录制音频",
    icon: Mic,
    color: "text-orange-700",
    bg: "bg-orange-50",
    status: "开发中",
    category: "媒体",
  },
  {
    name: "文字转语音",
    description: "文本朗读与导出",
    icon: Volume2,
    color: "text-green-700",
    bg: "bg-green-50",
    status: "开发中",
    category: "媒体",
  },
  {
    name: "文本总结",
    description: "长文一键提炼要点",
    icon: ScrollText,
    color: "text-violet-700",
    bg: "bg-violet-50",
    status: "开发中",
    category: "AI",
  },
  {
    name: "智能翻译",
    description: "自然流畅的多语言翻译",
    icon: Languages,
    color: "text-blue-800",
    bg: "bg-blue-50",
    status: "开发中",
    category: "AI",
  },
  {
    name: "文档问答",
    description: "上传文档直接提问",
    icon: FileQuestion,
    color: "text-amber-700",
    bg: "bg-amber-50",
    status: "开发中",
    category: "AI",
  },
  {
    name: "会议纪要",
    description: "录音或文字生成纪要",
    icon: UsersRound,
    color: "text-teal-700",
    bg: "bg-teal-50",
    status: "开发中",
    category: "AI",
  },
  {
    name: "邮件润色",
    description: "优化邮件措辞与语气",
    icon: Mail,
    color: "text-rose-700",
    bg: "bg-rose-50",
    status: "开发中",
    category: "AI",
  },
  {
    name: "剪贴板历史",
    description: "记录复制过的内容",
    icon: Clipboard,
    color: "text-slate-700",
    bg: "bg-slate-100",
    status: "开发中",
    category: "生活",
  },
  {
    name: "快捷笔记",
    description: "随手记录临时想法",
    icon: StickyNote,
    color: "text-yellow-800",
    bg: "bg-yellow-50",
    status: "开发中",
    category: "生活",
  },
  {
    name: "待办清单",
    description: "简单任务管理",
    icon: CheckSquare,
    color: "text-green-800",
    bg: "bg-green-50",
    status: "开发中",
    category: "生活",
  },
  {
    name: "习惯打卡",
    description: "每日习惯追踪",
    icon: CalendarCheck,
    color: "text-pink-700",
    bg: "bg-pink-50",
    status: "开发中",
    category: "生活",
  },
  {
    name: "记账",
    description: "简单收支记录",
    icon: Receipt,
    color: "text-emerald-800",
    bg: "bg-emerald-50",
    status: "开发中",
    category: "生活",
  },
  {
    name: "阅读清单",
    description: "稍后读与阅读收藏",
    icon: BookMarked,
    color: "text-indigo-800",
    bg: "bg-indigo-50",
    status: "开发中",
    category: "生活",
  },
  {
    name: "名片整理",
    description: "联系人信息归档",
    icon: Contact,
    color: "text-orange-800",
    bg: "bg-orange-50",
    status: "开发中",
    category: "生活",
  },
  {
    name: "便签",
    description: "随手贴便签，首页常驻展示",
    icon: NotepadText,
    color: "text-amber-800",
    bg: "bg-amber-50",
    status: "开发中",
    category: "生活",
  },
  {
    name: "每日一句",
    description: "每天更新一段正能量文案",
    icon: Quote,
    color: "text-sky-800",
    bg: "bg-sky-50",
    status: "开发中",
    category: "生活",
  },
];

export default function ToolsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [searchOpen, setSearchOpen] = useState(false);

  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      const matchesCategory =
        selectedCategory === "全部" || tool.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  const groupedTools = useMemo(() => {
    if (selectedCategory !== "全部") {
      return { [selectedCategory]: filteredTools };
    }
    const groups: Record<string, Tool[]> = {};
    for (const tool of filteredTools) {
      if (!groups[tool.category]) groups[tool.category] = [];
      groups[tool.category].push(tool);
    }
    return groups;
  }, [filteredTools, selectedCategory]);

  return (
    <>
      <PageHeader description="高频使用的小工具集合，将重复性工作变成一键操作">
        {/* 宽屏：完整胶囊 */}
        <div className="hidden items-center gap-1 rounded-[2px] bg-[#ECECEC] px-2 py-1.5 xl:flex">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#999999]" />
            <input
              type="text"
              placeholder="搜索工具"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-52 rounded-[2px] bg-white pl-9 pr-3 text-[13px] text-[#000000] placeholder:text-[#999999] outline-none"
            />
          </div>

          <div className="mx-1 h-4 w-px bg-[#E5E5E5]" />

          <div className="flex items-center gap-0.5">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`whitespace-nowrap rounded-[2px] px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedCategory === category
                    ? "bg-[#000000] text-white"
                    : "text-[#8A8A8A] hover:text-[#000000]"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* 窄屏：搜索收成图标，分类收成下拉 */}
        <div className="flex items-center gap-1 rounded-[2px] bg-[#ECECEC] px-2 py-1.5 xl:hidden">
          {searchOpen && (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#999999]" />
              <input
                autoFocus
                type="text"
                placeholder="搜索工具"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-40 rounded-[2px] bg-white pl-9 pr-3 text-[13px] text-[#000000] placeholder:text-[#999999] outline-none"
              />
            </div>
          )}
          <button
            aria-label={searchOpen ? "关闭搜索" : "打开搜索"}
            onClick={() => {
              if (searchOpen) setSearchQuery("");
              setSearchOpen(!searchOpen);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-white hover:text-[#000000]"
          >
            {searchOpen ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
          </button>

          <div className="mx-1 h-4 w-px bg-[#E5E5E5]" />

          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white outline-none">
              {selectedCategory}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-28 rounded-[2px]"
            >
              {categories.map((category) => (
                <DropdownMenuItem
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-[2px] text-[13px] ${
                    selectedCategory === category
                      ? "font-medium text-[#000000]"
                      : "text-[#666666]"
                  }`}
                >
                  {category}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageHeader>
      <div className="space-y-8 px-6 py-4">

        {/* Tools grid by category */}
        {Object.keys(groupedTools).length === 0 ? (
          <div className="rounded-[2px] border border-dashed border-[#D9D9D9] bg-white p-12 text-center">
            <p className="text-sm text-[#A0A8B4]">未找到匹配的工具</p>
          </div>
        ) : (
          Object.entries(groupedTools).map(([category, items]) => (
            <section key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-[3px] bg-[#000000]" />
                <h2 className="text-sm font-semibold text-[#000000]">
                  {category}
                </h2>
                <span className="text-xs text-[#999999]">{items.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {items.map((tool) => (
                    <div
                      key={tool.name}
                      className={`group flex cursor-pointer items-center gap-3 rounded-[2px] bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] ${
                        tool.status === "开发中"
                          ? "opacity-60 hover:opacity-100"
                          : ""
                      }`}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] bg-[#F5F5F5] transition-colors group-hover:bg-[#000000]">
                        <tool.icon className="h-[18px] w-[18px] text-[#1F1F1F] transition-colors group-hover:text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium text-[#000000]">
                          {tool.name}
                        </h3>
                        <p className="mt-0.5 truncate text-xs text-[#8A8A8A]">
                          {tool.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
