"use client";

import { ArrowLeft, Check, ListChecks, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { MdDocumentSummary } from "@/lib/markdown/documents";
import type { MdTag } from "@/lib/markdown/tags";
import { TagFilterSelect } from "./tag-filter-select";

/**
 * 左栏：文档列表（《功能/Markdown编辑器》§二 2.2、《界面设计规范》§7.25.3）。
 *
 * 纯展示 + 回调：搜索词、选中项都在 `MarkdownEditorView` 里——左栏自己留一份的话，
 * 两处选中态迟早对不上。
 *
 * **删除在行尾**（2026-10-30 联调改的）：删除跟着「哪一篇」走，而不是绑在
 * 「当前打开的那篇」上——顶行那种位置在没打开文档时还得留一个灰按钮。
 * 行尾的垃圾桶**一直显示**（不靠 hover 才出现），hover 时由灰变纯黑，点它弹二次确认
 * （防误触靠确认框，不靠藏按钮）。
 */

/** 列表里的时间只要 `MM-DD HH:mm`：年份在这里是噪音，排序才是重点。 */
function shortTime(ts: number): string {
  // 复用 `formatDateTime` 的 UTC+8 口径，只截掉年份（不自己拼，见 §七「时间显示跨时区漂移」）
  return formatDateTime(ts).slice(5);
}

interface DocumentListProps {
  /** 已经按搜索词过滤过的文档（父组件算好，批量条要用同一份「可见范围」）。 */
  documents: MdDocumentSummary[];
  /** 未过滤的总数：只用来区分「一篇都没有」和「搜不到」两种空态。 */
  totalCount: number;
  activeId: number | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (document: MdDocumentSummary) => void;
  /** 删除某一篇（行尾的垃圾桶；二次确认由父组件弹）。 */
  onDelete: (document: MdDocumentSummary) => void;
  onCreate: () => void;
  /** 批量模式：行内出现复选框、行尾垃圾桶让位、顶部换成批量条。 */
  selectionMode?: boolean;
  checkedIds?: Set<number>;
  onEnterSelection?: () => void;
  onExitSelection?: () => void;
  onToggleCheck?: (id: number) => void;
  onToggleAll?: () => void;
  onDeleteChecked?: () => void;
  busy?: boolean;
  /** 左栏顶部的标签筛选（全部 / 无标签 / 各标签）。 */
  tags: MdTag[];
  /** 当前筛选：`null` = 全部、`UNTAGGED_KEY` = 无标签、否则是标签的归一化 key。 */
  activeTagKey: string | null;
  /** 「无标签」有多少篇（下拉里显示）。 */
  untaggedCount: number;
  onSelectTagFilter: (key: string | null) => void;
  onOpenTagManager: () => void;
  /** 过滤后为空时的两句文案（父组件按「搜不到 / 这个标签下没有」算好）。 */
  emptyTitle?: string;
  emptyHint?: string;
  /** 手机（< md）的全屏版本：顶部给一行「← 返回」。抽屉版本不传。 */
  onBack?: () => void;
  className?: string;
}

export function DocumentList({
  documents,
  activeId,
  query,
  onQueryChange,
  onSelect,
  onDelete,
  onCreate,
  totalCount,
  tags,
  activeTagKey,
  untaggedCount,
  onSelectTagFilter,
  onOpenTagManager,
  emptyTitle,
  emptyHint,
  selectionMode = false,
  checkedIds,
  onEnterSelection,
  onExitSelection,
  onToggleCheck,
  onToggleAll,
  onDeleteChecked,
  busy = false,
  onBack,
  className,
}: DocumentListProps) {
  const keyword = query.trim();
  // `documents` 已经是父组件按搜索词过滤过的（批量条的「全选 / 已选」要跟它同一份范围）
  const visible = documents;
  const checked = checkedIds ?? new Set<number>();
  const allChecked = visible.length > 0 && visible.every((document) => checked.has(document.id));

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col bg-white", className)}>
      {onBack ? (
        <div className="flex h-12 shrink-0 items-center border-b border-[#F0F0F0] px-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 cursor-pointer items-center gap-1 rounded-[2px] px-2 text-[13px] text-[#1F1F1F] transition-colors hover:bg-[#F5F5F5]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回
          </button>
        </div>
      ) : null}

      {selectionMode ? (
        /* 批量条：挤掉「新建」那一行，高度不变（不把列表往下推） */
        <div className="flex h-[48px] shrink-0 items-center gap-1 px-2">
          <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-[#666666]">
            已选 {checked.size} / {visible.length}
          </span>
          <button
            type="button"
            onClick={onToggleAll}
            aria-label={allChecked ? "取消全选" : "全选"}
            title={allChecked ? "取消全选" : "全选"}
            className={cn(
              "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] transition-colors hover:bg-[#F5F5F5]",
              allChecked ? "text-[#000000]" : "text-[#666666]",
            )}
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDeleteChecked}
            disabled={checked.size === 0}
            aria-label="删除选中的文档"
            title="删除选中的文档"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#B91C1C] transition-colors hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onExitSelection}
            aria-label="退出批量选择"
            title="退出批量选择"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#F5F5F5]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="shrink-0 p-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCreate}
              disabled={busy}
              className="flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 rounded-[2px] bg-[#000000] px-3 text-[12px] text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              新建
            </button>
            <button
              type="button"
              onClick={onEnterSelection}
              disabled={visible.length === 0}
              aria-label="批量选择"
              title="批量选择"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="shrink-0 px-2 pb-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#999999]"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索标题"
            aria-label="搜索标题"
            className="h-8 w-full rounded-[2px] border border-[#E5E5E5] bg-white pl-7 pr-7 text-[12px] text-[#1F1F1F] outline-none placeholder:text-[#A0A8B4] focus:border-[#000000]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="清除搜索"
              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[2px] text-[#999999] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <TagFilterSelect
        tags={tags}
        activeKey={activeTagKey}
        totalCount={totalCount}
        untaggedCount={untaggedCount}
        onSelect={onSelectTagFilter}
        onOpenManager={onOpenTagManager}
      />

      {/* 三种状态互斥：没有文档 / 搜不到 / 有列表。空态沿用全站那一套（虚线框 + 一句话 +
          主按钮，见便签、待办、工具中心的空态），不在这里另立一套悬空的灰字 */}
      {documents.length === 0 && totalCount === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-4">
          <div className="w-full rounded-[2px] border border-dashed border-[#D9D9D9] bg-white px-3 py-6 text-center">
            <p className="text-[12px] text-[#666666]">还没有文档</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#A0A8B4]">
              停手就自动保存，随时能导出 .md
            </p>
            <button
              type="button"
              onClick={onCreate}
              disabled={busy}
              className="mt-3 h-7 cursor-pointer rounded-[2px] bg-[#000000] px-3 text-[11px] text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-60"
            >
              写第一篇
            </button>
          </div>
        </div>
      ) : documents.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-4">
          <div className="w-full rounded-[2px] border border-dashed border-[#D9D9D9] bg-white px-3 py-6 text-center">
            <p className="text-[12px] leading-relaxed text-[#666666]">
              {emptyTitle ?? `没有标题包含「${keyword}」的文档`}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#A0A8B4]">
              {emptyHint ?? "换个词试试"}
            </p>
          </div>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {visible.map((document) => {
            const active = document.id === activeId;
            return (
              <li key={document.id} className="group relative">
                <button
                  type="button"
                  // 批量模式下点整行 = 勾选 / 取消，不切文档（免得一点就跑偏）
                  onClick={() => (selectionMode ? onToggleCheck?.(document.id) : onSelect(document))}
                  aria-current={!selectionMode && active ? "true" : undefined}
                  aria-pressed={selectionMode ? checked.has(document.id) : undefined}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-[2px] px-2.5 py-1.5 text-left transition-colors",
                    selectionMode ? "pr-2.5" : "pr-8",
                    // 批量模式下用「勾选」当唯一高亮，当前打开那篇不再另给底色（两种灰底分不清）
                    (selectionMode ? checked.has(document.id) : active)
                      ? "bg-[#F5F5F5]"
                      : "hover:bg-[#FAFAFA]",
                  )}
                >
                  {selectionMode ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border transition-colors",
                        checked.has(document.id)
                          ? "border-[#000000] bg-[#000000] text-white"
                          : "border-[#D9D9D9] bg-white",
                      )}
                    >
                      {checked.has(document.id) ? <Check className="h-3 w-3" /> : null}
                    </span>
                  ) : null}
                  <span className="flex min-w-0 flex-1 flex-col items-start">
                    <span className="w-full truncate text-[13px] text-[#000000]">
                      {document.title}
                    </span>
                    <span className="mt-0.5 text-[11px] text-[#999999]">
                      {shortTime(document.updatedAt)}
                    </span>
                  </span>
                </button>

                {/*
                  删除跟着这一篇走（2026-10-30 联调定的）：顶行不放删除——那里删的是
                  「当前打开的那篇」，没打开文档时还得占一个灰按钮。放在行尾之后，
                  删哪篇一眼看清。
                  **常显**（不靠 hover 才出现：看不见的动作等于没有），hover 时图标由灰变纯黑。
                */}
                {selectionMode ? null : (
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onClick={() => onDelete(document)}
                    aria-label={`删除「${document.title}」`}
                    title="删除这篇文档"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
