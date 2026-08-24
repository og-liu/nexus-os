"use client";

import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppShell } from "@/components/app-shell";

interface PageHeaderProps {
  /** 手机端短标题（与侧边栏导航名一致） */
  title: string;
  /** PC 端完整标题，不传则两端都显示 title */
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  children,
  className,
}: PageHeaderProps) {
  const { openNav } = useAppShell();

  return (
    <div
      className={cn(
        "sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-[#E8E8E8] bg-[#F5F5F5] px-4 text-black md:px-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* 手机端汉堡按钮（md 及以上隐藏） */}
        <button
          aria-label="打开菜单"
          onClick={openNav}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] text-[#1F1F1F] transition-colors hover:bg-[#ECECEC] lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold leading-tight text-[#000000] md:truncate md:text-xl">
          {/* 手机端显示短标题，md 及以上显示完整标题 */}
          <span className="lg:hidden">{title}</span>
          <span className="hidden lg:inline">{description ?? title}</span>
        </h1>
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-3">{children}</div>
      ) : null}
    </div>
  );
}
