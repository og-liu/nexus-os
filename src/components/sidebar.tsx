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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoIcon } from "@/components/logo-icon";

const navItems = [
  { href: "/", label: "总览", icon: Brain },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/tools", label: "工具", icon: Rocket },
  { href: "/files", label: "文件", icon: FolderOpen },
  { href: "/knowledge", label: "知识", icon: BookOpen },
  { href: "/automation", label: "自动", icon: Zap },
  { href: "/settings", label: "设置", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [rippleHref, setRippleHref] = useState<string | null>(null);

  const handleClick = (href: string) => {
    const isActive =
      href === "/" ? pathname === "/" : pathname.startsWith(href);
    if (isActive) return;
    setRippleHref(href);
  };

  const handleAnimationEnd = () => {
    setRippleHref(null);
  };

  return (
    <aside className="flex h-screen w-20 flex-col border-r border-[#E5E5E5] bg-[#F5F5F5] 2xl:w-56">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div style={{ display: 'flex', margin: '0 auto' }}><LogoIcon className="h-9 w-9 text-black" />
          <span className="hidden text-lg font-semibold text-black 2xl:inline" style={{ fontFamily: 'var(--font-sekuya)', lineHeight: 1, letterSpacing: '0.1em', marginLeft: '10px' }}>
            Nexus<br/>OS
          </span>
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
                isActive ? "bg-[#d5e3f6]" : "hover:bg-[#ededed]"
              )}
            >
              {rippleHref === item.href && (
                <span
                  className="absolute inset-0 origin-center animate-ripple bg-[#d5e3f6]"
                  onAnimationEnd={handleAnimationEnd}
                />
              )}
              <item.icon className="z-10 h-6 w-6 2xl:absolute 2xl:left-4" />
              <span className="relative z-10 hidden 2xl:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
