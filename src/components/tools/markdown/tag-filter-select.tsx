"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Settings2, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tagKey, type MdTag } from "@/lib/markdown/tags";

/**
 * 左栏的标签筛选（《功能/Markdown编辑器》§2.2）。
 *
 * **为什么是下拉而不是一排 chips**（2026-10-31 重做）：左栏只有 240px，chips 一起过三四个
 * 就得横向滚，标签十几个时根本翻不过来、也看不到全貌。下拉只占一行、当前筛选一直显示，
 * 标签再多也只是面板里滚动。
 *
 * 面板里三档 + 各标签（带篇数）+ 底部的「管理标签」：筛选和「管词表」是两件事，
 * 但都得从这里够得着，否则用户得多点一次才知道另一边存在。
 */

/** 「无标签」这一档在筛选状态里的表示（标签 key 不可能等于它）。 */
export const UNTAGGED_KEY = "__untagged__";

interface TagFilterSelectProps {
  tags: MdTag[];
  /** 当前筛选：`null` = 全部；`UNTAGGED_KEY` = 无标签；否则是标签的归一化 key。 */
  activeKey: string | null;
  /** 全部文档数 / 没标签的文档数（给「全部」「无标签」显示篇数）。 */
  totalCount: number;
  untaggedCount: number;
  onSelect: (key: string | null) => void;
  onOpenManager: () => void;
}

export function TagFilterSelect({
  tags,
  activeKey,
  totalCount,
  untaggedCount,
  onSelect,
  onOpenManager,
}: TagFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  // 点外面 / 按 Esc 关掉
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeTag =
    activeKey !== null && activeKey !== UNTAGGED_KEY
      ? tags.find((tag) => tagKey(tag.name) === activeKey)
      : undefined;
  const label = activeKey === null ? "全部" : activeKey === UNTAGGED_KEY ? "无标签" : (activeTag?.name ?? "全部");

  const keyword = query.trim().toLowerCase();
  const visibleTags = keyword
    ? tags.filter((tag) => tag.name.toLowerCase().includes(keyword))
    : tags;

  const pick = (key: string | null) => {
    onSelect(key);
    setOpen(false);
    setQuery("");
  };

  const rowClass =
    "flex w-full cursor-pointer items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[#F5F5F5]";

  return (
    <div ref={boxRef} className="relative px-2 pb-2">
      {/*
        外观上刻意做成「筛选控件」而不是「输入框」：
        - 左侧是图标不是「标签」二字（文字挨着值会连成一句话，像输入框里填了正文）；
        - 整行文字统一 #8A8A8A（2026-10-31 联调：已筛选也保持同样的灰，不要纯黑）；
          只有展开时边框才变黑；
        - 已经筛了某个标签时，右侧多一个 ×（这就是「已筛选」的唯一视觉信号），一步回到「全部」。
      */}
      <div
        className={cn(
          "flex h-8 items-center rounded-[2px] border bg-white transition-colors",
          open ? "border-[#000000]" : "border-[#E5E5E5] hover:border-[#C4C4C4]",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="筛选标签"
          aria-expanded={open}
          className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-[2px] pl-2 pr-1"
        >
          <Tag
            className="h-3 w-3 shrink-0 text-[#8A8A8A]"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-left text-[12px] text-[#8A8A8A]">
            {label}
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 text-[#8A8A8A] transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
        {activeKey !== null ? (
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label="清除标签筛选"
            title="清除筛选"
            className="mr-1 flex h-6 w-5 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#A0A8B4] transition-colors hover:bg-[#F5F5F5] hover:text-[#333333]"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-2 right-2 top-[calc(100%-4px)] z-30 flex max-h-[min(60vh,420px)] flex-col overflow-hidden rounded-[2px] border border-[#E5E5E5] bg-white shadow-md">
          <div className="relative shrink-0 border-b border-[#F5F5F5] p-1.5">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A8B4]"
            />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标签"
              aria-label="搜索标签"
              className="h-7 w-full rounded-[2px] bg-[#F5F5F5] pl-7 pr-2 text-[12px] text-[#1F1F1F] outline-none placeholder:text-[#A0A8B4]"
            />
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto p-1">
            <li>
              <button type="button" onClick={() => pick(null)} className={rowClass}>
                <span className="min-w-0 flex-1 truncate text-[#1F1F1F]">全部</span>
                <span className="shrink-0 text-[11px] tabular-nums text-[#999999]">{totalCount}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => pick(UNTAGGED_KEY)}
                className={rowClass}
              >
                <span className="min-w-0 flex-1 truncate text-[#1F1F1F]">无标签</span>
                <span className="shrink-0 text-[11px] tabular-nums text-[#999999]">{untaggedCount}</span>
              </button>
            </li>
            {visibleTags.length > 0 ? <li className="my-1 border-t border-[#F5F5F5]" aria-hidden="true" /> : null}
            {visibleTags.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => pick(activeKey === tagKey(tag.name) ? null : tagKey(tag.name))}
                  className={cn(rowClass, "gap-1")}
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      activeKey === tagKey(tag.name) ? "text-[#000000]" : "text-[#1F1F1F]",
                      tag.name.includes("/") && "pl-3 text-[#666666]",
                    )}
                  >
                    {tag.name}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[#999999]">{tag.count}</span>
                </button>
              </li>
            ))}
            {visibleTags.length === 0 && keyword !== "" ? (
              <li className="px-2 py-3 text-center text-[11px] text-[#A0A8B4]">
                没有名字包含「{query.trim()}」的标签
              </li>
            ) : null}
          </ul>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setQuery("");
              onOpenManager();
            }}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 border-t border-[#F5F5F5] px-2 py-2 text-[12px] text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            管理标签…
          </button>
        </div>
      ) : null}
    </div>
  );
}
