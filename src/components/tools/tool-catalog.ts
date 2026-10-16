import {
  AudioLines,
  BadgeCheck,
  Binary,
  BookMarked,
  Bookmark,
  Braces,
  CalendarCheck,
  CalendarClock,
  CheckSquare,
  Clapperboard,
  Clipboard,
  Clock,
  Code,
  Contact,
  CopyX,
  Database,
  FileCode,
  FilePenLine,
  FileQuestion,
  FileSearch,
  FileText,
  Film,
  Fingerprint,
  FolderOpen,
  FolderTree,
  FolderX,
  GitCompare,
  Globe,
  HardDrive,
  Hash,
  Image,
  Images,
  KeyRound,
  Languages,
  LayoutGrid,
  Lock,
  Mail,
  Mic,
  Music,
  NotepadText,
  Palette,
  QrCode,
  Quote,
  Receipt,
  ScanLine,
  Scissors,
  ScrollText,
  Search,
  Send,
  Split,
  Sticker,
  StickyNote,
  TypeOutline,
  UsersRound,
  Video,
  Volume2,
  ZoomIn,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 工具目录（《功能/工具中心》§三）。
 *
 * 当前是**前端静态数据**（自旧界面逐条迁移），因此住在组件层而不是 `lib/`：
 * 数据里带着 React 组件引用（Lucide 图标），而 `lib/` 的红线是不许 import 组件。
 * 将来工具目录进数据库时：数据访问进 `lib/tools/`，本文件改为从那里读取，组件不动。
 *
 * 迁移备注：旧数据里每个工具还带一组颜色字段（`color` / `bg`），但旧界面从未渲染它们
 * （实测旧界面工具卡为黑白单色）——按《界面设计规范》§10 的修正，不再迁移。
 */

export type ToolStatus = "可用" | "开发中";

export const TOOL_CATEGORIES = ["图片", "文件", "文本", "开发", "媒体", "AI", "生活"] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export interface Tool {
  name: string;
  description: string;
  icon: LucideIcon;
  status: ToolStatus;
  category: ToolCategory;
}

export const TOOLS: Tool[] = [
  // ---------- 图片 ----------
  {
    name: "图片压缩",
    description: "智能压缩图片体积，保持画质",
    icon: Image,
    status: "可用",
    category: "图片",
  },
  {
    name: "图片格式转换",
    description: "PNG、JPG、WebP 等格式互转",
    icon: Images,
    status: "可用",
    category: "图片",
  },
  {
    name: "智能抠图",
    description: "一键去除图片背景",
    icon: Scissors,
    status: "开发中",
    category: "图片",
  },
  {
    name: "图片水印",
    description: "批量添加文字或图片水印",
    icon: Sticker,
    status: "开发中",
    category: "图片",
  },
  {
    name: "图片拼接",
    description: "横拼、竖拼、九宫格",
    icon: LayoutGrid,
    status: "开发中",
    category: "图片",
  },
  {
    name: "GIF 制作",
    description: "图片或视频转 GIF",
    icon: Film,
    status: "开发中",
    category: "图片",
  },
  {
    name: "图片放大",
    description: "AI 超分辨率放大",
    icon: ZoomIn,
    status: "开发中",
    category: "图片",
  },
  {
    name: "取色器",
    description: "从图片提取主色与调色板",
    icon: Palette,
    status: "开发中",
    category: "图片",
  },
  {
    name: "Favicon 生成",
    description: "一键生成多尺寸网站图标",
    icon: Globe,
    status: "开发中",
    category: "图片",
  },
  {
    name: "截图 OCR",
    description: "截图后直接识别文字",
    icon: ScanLine,
    status: "可用",
    category: "图片",
  },
  {
    name: "二维码工具",
    description: "生成或解析二维码",
    icon: QrCode,
    status: "开发中",
    category: "图片",
  },
  {
    name: "以图找图",
    description: "在目录中定位相似图片",
    icon: Search,
    status: "开发中",
    category: "图片",
  },

  // ---------- 文件 ----------
  {
    name: "文件批量处理",
    description: "批量重命名、移动、转换",
    icon: FolderOpen,
    status: "开发中",
    category: "文件",
  },
  {
    name: "重复文件清理",
    description: "按哈希查找并清理重复文件",
    icon: CopyX,
    status: "开发中",
    category: "文件",
  },
  {
    name: "大文件扫描",
    description: "快速定位空间占用大户",
    icon: HardDrive,
    status: "开发中",
    category: "文件",
  },
  {
    name: "空文件夹清理",
    description: "一键删除空文件夹",
    icon: FolderX,
    status: "开发中",
    category: "文件",
  },
  {
    name: "文件重命名",
    description: "支持正则与序号规则",
    icon: FilePenLine,
    status: "开发中",
    category: "文件",
  },
  {
    name: "文件自动分类",
    description: "按日期、类型、扩展名整理",
    icon: FolderTree,
    status: "开发中",
    category: "文件",
  },
  {
    name: "文件内容搜索",
    description: "全文检索文件内容",
    icon: FileSearch,
    status: "开发中",
    category: "文件",
  },
  {
    name: "文件加密",
    description: "本地文件加密与解密",
    icon: Lock,
    status: "开发中",
    category: "文件",
  },

  // ---------- 文本 ----------
  {
    name: "文本处理",
    description: "编码转换、大小写、格式清理",
    icon: FileText,
    status: "可用",
    category: "文本",
  },
  {
    name: "Markdown 编辑器",
    description: "实时预览与快捷编辑",
    icon: FileCode,
    status: "开发中",
    category: "文本",
  },
  {
    name: "JSON 工具",
    description: "格式化、校验、压缩",
    icon: Braces,
    status: "开发中",
    category: "文本",
  },
  {
    name: "正则测试",
    description: "在线编写与测试正则",
    icon: Split,
    status: "开发中",
    category: "文本",
  },
  {
    name: "Base64 编解码",
    description: "文本与文件 Base64 转换",
    icon: Binary,
    status: "开发中",
    category: "文本",
  },
  {
    name: "哈希计算",
    description: "MD5、SHA 系列哈希",
    icon: Hash,
    status: "开发中",
    category: "文本",
  },
  {
    name: "UUID 生成",
    description: "生成唯一标识符",
    icon: Fingerprint,
    status: "开发中",
    category: "文本",
  },
  {
    name: "密码生成",
    description: "高强度随机密码",
    icon: KeyRound,
    status: "开发中",
    category: "文本",
  },
  {
    name: "文本对比",
    description: "两段文本差异对比",
    icon: GitCompare,
    status: "开发中",
    category: "文本",
  },
  {
    name: "字数统计",
    description: "字数、字符、阅读时间",
    icon: TypeOutline,
    status: "开发中",
    category: "文本",
  },

  // ---------- 开发 ----------
  {
    name: "Cron 解析",
    description: "Cron 表达式翻译与校验",
    icon: Clock,
    status: "开发中",
    category: "开发",
  },
  {
    name: "时间戳转换",
    description: "Unix 与本地时间互转",
    icon: CalendarClock,
    status: "开发中",
    category: "开发",
  },
  {
    name: "JWT 解析",
    description: "解析与验证 JWT Token",
    icon: BadgeCheck,
    status: "开发中",
    category: "开发",
  },
  {
    name: "SQL 格式化",
    description: "SQL 美化与压缩",
    icon: Database,
    status: "开发中",
    category: "开发",
  },
  {
    name: "HTML 格式化",
    description: "HTML / XML 美化",
    icon: Code,
    status: "开发中",
    category: "开发",
  },
  {
    name: "颜色转换",
    description: "HEX、RGB、HSL 互转",
    icon: Palette,
    status: "开发中",
    category: "开发",
  },
  {
    name: "API 请求测试",
    description: "轻量 HTTP 接口调试",
    icon: Send,
    status: "开发中",
    category: "开发",
  },
  {
    name: "代码片段",
    description: "收藏与管理常用代码",
    icon: Bookmark,
    status: "开发中",
    category: "开发",
  },

  // ---------- 媒体 ----------
  {
    name: "音频转换",
    description: "MP3、WAV、FLAC 互转",
    icon: Music,
    status: "开发中",
    category: "媒体",
  },
  {
    name: "视频转 GIF",
    description: "视频片段转动画",
    icon: Clapperboard,
    status: "开发中",
    category: "媒体",
  },
  {
    name: "视频压缩",
    description: "降低视频体积",
    icon: Video,
    status: "开发中",
    category: "媒体",
  },
  {
    name: "音频提取",
    description: "从视频中提取音频",
    icon: AudioLines,
    status: "开发中",
    category: "媒体",
  },
  {
    name: "录音机",
    description: "快速录制音频",
    icon: Mic,
    status: "开发中",
    category: "媒体",
  },
  {
    name: "文字转语音",
    description: "文本朗读与导出",
    icon: Volume2,
    status: "开发中",
    category: "媒体",
  },

  // ---------- AI ----------
  {
    name: "文本总结",
    description: "长文一键提炼要点",
    icon: ScrollText,
    status: "开发中",
    category: "AI",
  },
  {
    name: "智能翻译",
    description: "自然流畅的多语言翻译",
    icon: Languages,
    status: "开发中",
    category: "AI",
  },
  {
    name: "文档问答",
    description: "上传文档直接提问",
    icon: FileQuestion,
    status: "开发中",
    category: "AI",
  },
  {
    name: "会议纪要",
    description: "录音或文字生成纪要",
    icon: UsersRound,
    status: "开发中",
    category: "AI",
  },
  {
    name: "邮件润色",
    description: "优化邮件措辞与语气",
    icon: Mail,
    status: "开发中",
    category: "AI",
  },

  // ---------- 生活 ----------
  {
    name: "剪贴板历史",
    description: "记录复制过的内容",
    icon: Clipboard,
    status: "开发中",
    category: "生活",
  },
  {
    name: "快捷笔记",
    description: "随手记录临时想法",
    icon: StickyNote,
    status: "开发中",
    category: "生活",
  },
  {
    name: "待办清单",
    description: "简单任务管理",
    icon: CheckSquare,
    status: "开发中",
    category: "生活",
  },
  {
    name: "习惯打卡",
    description: "每日习惯追踪",
    icon: CalendarCheck,
    status: "开发中",
    category: "生活",
  },
  {
    name: "记账",
    description: "简单收支记录",
    icon: Receipt,
    status: "开发中",
    category: "生活",
  },
  {
    name: "阅读清单",
    description: "稍后读与阅读收藏",
    icon: BookMarked,
    status: "开发中",
    category: "生活",
  },
  {
    name: "名片整理",
    description: "联系人信息归档",
    icon: Contact,
    status: "开发中",
    category: "生活",
  },
  {
    name: "便签",
    description: "随手贴便签，首页常驻展示",
    icon: NotepadText,
    status: "开发中",
    category: "生活",
  },
  {
    name: "每日一句",
    description: "每天更新一段正能量文案",
    icon: Quote,
    status: "开发中",
    category: "生活",
  },
];
