"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";

/**
 * 工具页的吸顶条：列表滚过工具头部之后，从顶部滑入一条紧凑栏（图标 + 名称 + 新建）。
 *
 * 为什么需要它：便签页去掉了页头，工具头部很大（图标 / 描述 / 分类），
 * 列表一长就滚没了——滚动到中间时既看不到「这是哪个工具」，也够不着「新建」。
 *
 * 为什么用滚动位置而不是 IntersectionObserver：吸顶条本身是 `sticky`，
 * 如果哨兵也放在 sticky 容器里，它会跟着吸顶、永远「在视口内」，观察器不会触发。
 * 直接读 `main.scrollTop` 最稳（滚动容器是 AppShell 的 `<main>`，不是 window）。
 */
interface StickyToolBarProps {
  name: string;
  icon: LucideIcon;
  onNew: () => void;
}

/** 滚过工具头部（约 180px）后出现；比头部略早，避免中间出现「什么都没有」的空白。 */
const SHOW_AFTER_PX = 160;

export function StickyToolBar({ name, icon: Icon, onNew }: StickyToolBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const main = container.closest("main");
    if (!main) return;

    const onScroll = () => setVisible(main.scrollTop > SHOW_AFTER_PX);
    main.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      ref={containerRef}
      className="sticky top-0 z-30 -mx-4 h-0 md:-mx-6"
    >
      <div
        className={`flex h-12 items-center justify-between border-b border-[#E8E8E8] bg-[#F5F5F5]/95 px-4 backdrop-blur-sm transition-all duration-200 md:px-6 ${
          visible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-full opacity-0"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#1F1F1F]" />
          <span className="truncate text-sm font-medium text-[#000000]">
            {name}
          </span>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-[2px] bg-[#000000] px-2.5 text-xs font-medium text-white transition-colors hover:bg-[#333333]"
        >
          <Plus className="h-3.5 w-3.5" />
          新建
        </button>
      </div>
    </div>
  );
}
