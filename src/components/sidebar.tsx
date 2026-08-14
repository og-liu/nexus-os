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

function WaveFooter() {
  return (
    <div className="mt-auto w-full">
      <div className="relative h-16 w-full overflow-hidden bg-[#F5F5F5]">
        <div className="absolute inset-0 flex w-[200%] animate-wave-slow text-[#1890FF]/14">
          <svg
            viewBox="0 0 600 60"
            preserveAspectRatio="none"
            className="h-full w-1/2"
          >
            <path
              d="M0,40 Q50,15 100,40 T200,40 T300,40 T400,40 T500,40 T600,40 V60 H0 Z"
              fill="currentColor"
            />
          </svg>
          <svg
            viewBox="0 0 600 60"
            preserveAspectRatio="none"
            className="h-full w-1/2"
          >
            <path
              d="M0,40 Q50,15 100,40 T200,40 T300,40 T400,40 T500,40 T600,40 V60 H0 Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <div className="absolute inset-0 flex w-[200%] animate-wave text-[#1890FF]/28">
          <svg
            viewBox="0 0 600 60"
            preserveAspectRatio="none"
            className="h-full w-1/2"
          >
            <path
              d="M0,44 Q60,20 120,44 T240,44 T360,44 T480,44 T600,44 V60 H0 Z"
              fill="currentColor"
            />
          </svg>
          <svg
            viewBox="0 0 600 60"
            preserveAspectRatio="none"
            className="h-full w-1/2"
          >
            <path
              d="M0,44 Q60,20 120,44 T240,44 T360,44 T480,44 T600,44 V60 H0 Z"
              fill="currentColor"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

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
    <aside className="flex h-screen w-56 flex-col border-r border-[#E5E5E5] bg-[#F5F5F5]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div style={{ display: 'flex', margin: '0 auto' }}><LogoIcon className="h-9 w-9 text-black" />
          <span className="text-lg font-semibold text-black" style={{ fontFamily: 'var(--font-sekuya)', lineHeight: 1, letterSpacing: '0.1em', marginLeft: '10px' }}>
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
              <item.icon className="absolute left-4 z-10 h-6 w-6" />
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer wave animation */}
      <WaveFooter />
    </aside>
  );
}
