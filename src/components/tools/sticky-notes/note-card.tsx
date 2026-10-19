"use client";

import { Pin, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNoteTime } from "@/lib/sticky-notes/format";
import type { StickyNote } from "@/lib/sticky-notes/notes";

/**
 * 便签卡（《功能/便签》§2.1）。
 *
 * 统一缩略图：固定 80px 高、正文只显示一行（超出以省略号截断）、时间钉在底部。
 * 编辑走 `NoteDialog` 弹窗——原地展开会把这张卡撑高（长文本甚至占满一屏），
 * 破坏网格的统一高度，也把下面所有卡片顶下去。
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

/** 卡片右上角图标按钮的公共样式：可点 = 小手（界面设计规范 §2.5）。 */
const iconButtonClass =
  "flex h-6 w-6 cursor-pointer items-center justify-center rounded-[2px] transition-colors hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50";

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
      <article className="flex h-20 flex-col rounded-[2px] bg-white p-4">
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
            className="h-6 cursor-pointer rounded-[2px] px-2.5 text-xs text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="group relative flex h-20 flex-col rounded-[2px] border border-transparent bg-white p-4 transition-colors hover:border-[#000000]">
      {/* 操作按钮：触屏常显；桌面默认收起、hover 卡片时出现 */}
      <div className="absolute right-3 top-3 flex items-center gap-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={note.pinned ? "取消置顶" : "置顶"}
          title={note.pinned ? "取消置顶" : "置顶"}
          onClick={onTogglePin}
          disabled={busy}
          className={iconButtonClass}
        >
          <Pin
            className={cn(
              "h-3.5 w-3.5 transition-colors",
              note.pinned
                ? "fill-[#000000] text-[#000000]"
                : "text-[#A0A0A0] hover:text-[#000000]",
            )}
          />
        </button>
        <button
          type="button"
          aria-label="删除便签"
          title="删除便签"
          onClick={onRequestDelete}
          disabled={busy}
          className={iconButtonClass}
        >
          <Trash2 className="h-3.5 w-3.5 text-[#A0A0A0] transition-colors hover:text-[#B91C1C]" />
        </button>
      </div>

      {/* 点卡片打开编辑弹窗；用 button 包一层保证键盘可达 */}
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        className="flex h-full w-full cursor-pointer flex-col text-left"
      >
        <span className="line-clamp-1 whitespace-pre-wrap break-words pr-14 text-[13px] leading-relaxed text-[#000000]">
          {note.body}
        </span>
        <span className="mt-auto flex items-center gap-1 pt-2 text-[10px] text-[#999999]">
          {formatNoteTime(note.updatedAt)}
          {/* 置顶状态常显在时间右侧：右上角按钮要 hover 才出来，不能承担状态标识 */}
          {note.pinned ? (
            <span className="text-[10px] leading-none tracking-[0.12em] text-[#999999]">
              已置顶
            </span>
          ) : null}
        </span>
      </button>
    </article>
  );
}
