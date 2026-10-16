"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  Rocket,
  FolderOpen,
  Bot,
  BookOpen,
  Zap,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoIcon } from "@/components/layout/logo-icon";

/**
 * 侧边导航（《界面设计规范》§5.2）。
 *
 * - desktop：≥ lg 的常驻图标栏（w-20），文字藏进原生 title 提示；
 * - mobile：< lg 的抽屉版本，图标 + 文字（抽屉由 AppShell 管）。
 *
 * 两个版本共享同一个「涟漪」交互（§12.4）：点击非当前项时，在该项内叠一层
 * 激活色涟漪播放展开动画，让「点下 → 页面切换」之间有一帧可知的反馈。
 * 涟漪状态放在组件里、而不是布局里——Sidebar 在布局中常驻不卸载，
 * 跨页面导航时动画才能播完（若随页面重挂载，动画会被切断）。
 */

const navItems = [
  { href: "/", label: "总览", icon: Brain },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/knowledge", label: "知识", icon: BookOpen },
  { href: "/tools", label: "工具", icon: Rocket },
  { href: "/files", label: "文件", icon: FolderOpen },
  { href: "/automation", label: "自动", icon: Zap },
  { href: "/settings", label: "设置", icon: Settings },
];

interface SidebarProps {
  /** desktop：常驻图标栏；mobile：手机抽屉内的完整菜单 */
  variant?: "desktop" | "mobile";
  /** 手机抽屉中点击任一导航后关闭抽屉 */
  onNavigate?: () => void;
}

export function Sidebar({ variant = "desktop", onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const [rippleHref, setRippleHref] = useState<string | null>(null);

  const handleClick = (href: string) => {
    // 高亮判断：首页用精确匹配，其余用前缀匹配（子路由也算在此项下）
    const isActive =
      href === "/" ? pathname === "/" : pathname.startsWith(href);
    if (isActive) return; // 点当前项不播涟漪：没有要去的地方
    setRippleHref(href);
    onNavigate?.();
  };

  const handleAnimationEnd = () => {
    setRippleHref(null);
  };

  // ---------- 手机抽屉版本（图标 + 文字） ----------
  if (variant === "mobile") {
    return (
      <div className="flex h-full flex-col border-r border-[#E5E5E5]">
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <LogoIcon className="h-8 w-8 text-black" />
            <span
              className="text-base font-semibold leading-none text-black"
              style={{
                fontFamily: "var(--font-sekuya)",
                letterSpacing: "0.1em",
              }}
            >
              NEXUS OS
            </span>
          </div>
          <button
            aria-label="关闭菜单"
            onClick={onNavigate}
            className="flex h-8 w-8 items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#ECECEC] hover:text-[#000000]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 pb-4">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleClick(item.href)}
                className={cn(
                  "group relative flex items-center gap-3 overflow-hidden rounded-[2px] px-4 py-3 text-[15px] text-black transition-colors duration-200",
                  isActive ? "bg-[#d5e3f6]" : "hover:bg-[#ededed]",
                )}
              >
                {rippleHref === item.href && (
                  <span
                    className="absolute inset-0 origin-center animate-ripple bg-[#d5e3f6]"
                    onAnimationEnd={handleAnimationEnd}
                  />
                )}
                <item.icon className="relative z-10 h-5 w-5" />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  // ---------- 桌面常驻版本（纯图标栏，lg 及以上显示） ----------
  return (
    <aside className="hidden h-screen w-20 flex-col border-r border-[#E5E5E5] bg-[#F5F5F5] lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div style={{ display: "flex", margin: "0 auto" }}>
          <LogoIcon className="h-9 w-9 text-black" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-2 flex-1 space-y-2 px-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              onClick={() => handleClick(item.href)}
              className={cn(
                "group relative flex items-center justify-center overflow-hidden rounded-xl px-4 py-4 text-lg text-black transition-colors duration-200",
                isActive ? "bg-[#d5e3f6]" : "hover:bg-[#ededed]",
              )}
            >
              {rippleHref === item.href && (
                <span
                  className="absolute inset-0 origin-center animate-ripple bg-[#d5e3f6]"
                  onAnimationEnd={handleAnimationEnd}
                />
              )}
              <item.icon className="z-10 h-6 w-6" />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
