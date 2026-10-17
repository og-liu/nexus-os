"use client";

import { Pin, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNoteTime } from "@/lib/sticky-notes/format";
import type { StickyNote } from "@/lib/sticky-notes/notes";
import { NoteEditor } from "./note-editor";

/**
 * 便签卡（《功能/便签》§2.1 三态）。
 *
 * - 阅读：白卡 + 正文 + 时间；右上角置顶 / 删除按钮——**桌面 hover 才显、触屏常显**
 *   （触屏没有 hover，收起等于永远按不到）；
 * - 编辑：同一张卡原地换成 `NoteEditor`；
 * - 删除确认：卡片内容换成「删除这张便签？」+ 删除 / 取消，不弹全局对话框。
 *
 * 三态由父组件（视图）控制，保证同一时间只有一张卡在编辑、一张卡在确认删除。
 */

interface NoteCardProps {
  note: StickyNote;
  editing: boolean;
  confirmingDelete: boolean;
  busy: boolean;
  error: string | null;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (body: string) => void;
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
  editing,
  confirmingDelete,
  busy,
  error,
  onStartEdit,
  onCancelEdit,
  onSave,
  onTogglePin,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: NoteCardProps) {
  if (editing) {
    return (
      <article className="rounded-[2px] bg-white p-4">
        <NoteEditor
          initialValue={note.body}
          busy={busy}
          error={error}
          onSave={onSave}
          onCancel={onCancelEdit}
        />
      </article>
    );
  }

  if (confirmingDelete) {
    return (
      <article className="flex flex-col gap-3 rounded-[2px] bg-white p-4">
        <p className="text-[13px] text-[#000000]">删除这张便签？</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={busy}
            className="h-7 cursor-pointer rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50"
          >
            删除
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            disabled={busy}
            className="h-7 cursor-pointer rounded-[2px] px-3 text-xs text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="group relative rounded-[2px] bg-white p-4">
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

      {/* 点正文进入编辑态；用 button 包一层保证键盘可达 */}
      <button
        type="button"
        onClick={onStartEdit}
        disabled={busy}
        className="block w-full cursor-text text-left"
      >
        <span className="block whitespace-pre-wrap break-words pr-14 text-[13px] leading-relaxed text-[#000000]">
          {note.body}
        </span>
        <span className="mt-2 block text-[10px] text-[#999999]">
          {formatNoteTime(note.updatedAt)}
        </span>
      </button>
    </article>
  );
}
