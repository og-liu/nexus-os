import {
  BookOpen,
  Bot,
  Brain,
  FolderOpen,
  Rocket,
  Settings,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * 一级导航项（《界面设计规范》§5.2）。
 *
 * 从 `sidebar.tsx` 抽出来是因为页签栏也要用同一份文字（《功能/页签栏》§五）：
 * 侧栏写「工具」、页签栏写「工具」，两者共用一个真相源，改菜单名只改这一处。
 *
 * `icon` 是 React 组件，所以这份数据只能住组件层（`lib/` 的红线是不许 import 组件）。
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { href: "/", label: "总览", icon: Brain },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/knowledge", label: "知识", icon: BookOpen },
  { href: "/tools", label: "工具", icon: Rocket },
  { href: "/files", label: "文件", icon: FolderOpen },
  { href: "/automation", label: "自动", icon: Zap },
  { href: "/settings", label: "设置", icon: Settings },
];
