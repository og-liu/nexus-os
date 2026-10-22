"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNoteTime } from "@/lib/sticky-notes/format";
import type { StickyNote } from "@/lib/sticky-notes/notes";

/**
 * 便签卡（《功能/便签》§2.1）。
 *
 * 统一缩略图：**正方形**（`aspect-square`，宽随网格列宽，高自动等于宽），
 * 正文最多五行（超出省略），底部固定一行：左侧「时间 + 置顶文案」，右侧删除按钮。
 *
 * 置顶不用图钉图标，而是一段**可点的文字**：未置顶写「未置顶」、已置顶写「已置顶」，
 * 点它切换状态（状态与动作是同一个东西，不用再猜图标的含义）。
 * 删除按钮桌面 hover 才出现在这一行右侧、触屏常显——触屏没有 hover，收起等于永远按不到。
 *
 * 编辑走 `NoteDialog` 弹窗：整张卡是一层编辑按钮，时间文案与空白处都能点开；
 * 置顶文案与删除按钮浮在上层，点它们不会触发编辑。
 * 删除仍是原位二次确认：卡片自己变确认态，不弹全局对话框。
 */

interface NoteCardProps {
  note: StickyNote;
  confirmingDelete: boolean;
  busy: boolean;
  onEdit: () => void;
  onTogglePin: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

/** 操作按钮的公共样式：可点 = 小手（界面设计规范 §2.5）。 */
const iconButtonClass =
  "flex h-6 w-6 cursor-pointer items-center justify-center rounded-[2px] transition-colors hover:bg-[#F5F5F5] disabled:cursor-not-allowed";

export function NoteCard({
  note,
  confirmingDelete,
  busy,
  onEdit,
  onTogglePin,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: NoteCardProps) {
  if (confirmingDelete) {
    return (
      <article className="flex aspect-square flex-col rounded-[2px] bg-white p-3 md:p-4">
        <p className="text-[13px] text-[#000000]">删除这张便签？</p>
        <div className="mt-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={busy}
            className="h-6 cursor-pointer rounded-[2px] bg-[#000000] px-2.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50"
          >
            删除
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            disabled={busy}
            className="h-6 cursor-pointer rounded-[2px] bg-[#F5F5F5] px-2.5 text-xs text-[#666666] disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="group relative flex aspect-square flex-col rounded-[2px] border border-transparent bg-white transition-colors hover:border-[#000000]">
      {/* 整卡编辑层：正文 + 空白处（底部让出 40px 给固定行） */}
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        className="absolute inset-0 flex cursor-pointer flex-col p-3 pb-10 text-left disabled:cursor-not-allowed md:p-4"
      >
        <span className="line-clamp-5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[#000000]">
          {note.body}
        </span>
      </button>

      {/* 底部固定行：时间 + 置顶文案在左，删除在右（桌面 hover 才显） */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-center justify-between gap-0.5 md:inset-x-4 md:bottom-4">
        <span className="flex min-w-0 items-center gap-0.5 text-[10px] text-[#999999]">
          <span className="whitespace-nowrap">
            {formatNoteTime(note.updatedAt)}
          </span>
          <button
            type="button"
            aria-pressed={note.pinned}
            onClick={onTogglePin}
            disabled={busy}
            className="pointer-events-auto shrink-0 cursor-pointer text-[10px] text-[#999999] transition-colors hover:text-[#000000] disabled:cursor-not-allowed"
          >
            {note.pinned ? "已置顶" : "未置顶"}
          </button>
        </span>
        <button
          type="button"
          aria-label="删除便签"
          title="删除便签"
          onClick={onRequestDelete}
          disabled={busy}
          className={cn(
            iconButtonClass,
            "pointer-events-auto shrink-0 text-[#A0A0A0] hover:text-[#B91C1C] [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}
