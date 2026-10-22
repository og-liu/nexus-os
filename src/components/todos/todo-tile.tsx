"use client";

import { Check, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Todo } from "@/lib/todos/todos";

/**
 * 待办卡片（《功能/待办清单》§2.2 的工具页形态，与便签卡同构）。
 *
 * 布局与便签卡同一套语言：白卡固定高度、hover 出黑描边、时间钉在底部、右上角操作按钮
 * 桌面 hover 才显 / 触屏常显。点卡片本身就是编辑入口——与便签「点卡片打开弹窗」一致。
 *
 * **勾选框是独立按钮**，不是卡片按钮的一部分：点它只切换完成态，不会打开编辑弹窗。
 * 卡片按钮、勾选框、删除按钮三者是兄弟节点，从根上避免 `<button>` 套 `<button>`。
 *
 * 删除仍走原位二次确认：卡片内容换成「删除这条待办？」+ 删除 / 取消，不弹全局对话框。
 */

interface TodoTileProps {
  todo: Todo;
  /** 完成态：黑底白勾 + 标题灰划线。 */
  completed: boolean;
  /** 写操作进行中：整卡忽略点击，避免连点重复提交。 */
  busy: boolean;
  /** 删除的二态：整卡换成原位确认。 */
  confirmingDelete: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

export function TodoTile({
  todo,
  completed,
  busy,
  confirmingDelete,
  onToggle,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: TodoTileProps) {
  if (confirmingDelete) {
    return (
      <article className="flex h-24 flex-col rounded-[2px] bg-white p-4">
        <p className="text-[13px] text-[#000000]">删除这条待办？</p>
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
    <article className="group relative flex h-24 rounded-[2px] border border-transparent bg-white p-4 transition-colors hover:border-[#000000]">
      {/* 勾选框：独立按钮，点它只切换完成态 */}
      <button
        type="button"
        aria-label={completed ? "取消完成" : "标记完成"}
        title={completed ? "取消完成" : "标记完成"}
        aria-pressed={completed}
        onClick={onToggle}
        disabled={busy}
        className="absolute left-3 top-3 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-[2px] disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-[2px] border transition-colors",
            completed
              ? "border-[#000000] bg-[#000000]"
              : "border-[#D0D0D0] bg-white",
          )}
        >
          {completed ? <Check className="h-3 w-3 text-white" /> : null}
        </span>
      </button>

      {/* 删除：触屏常显；桌面收起、hover / 键盘聚焦卡片时出现 */}
      <button
        type="button"
        aria-label="删除待办"
        title="删除待办"
        onClick={onRequestDelete}
        disabled={busy}
        className="absolute right-3 top-3 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-[2px] text-[#A0A0A0] transition-opacity hover:text-[#B91C1C] disabled:cursor-not-allowed [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {/* 点卡片 = 编辑 */}
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        className="flex h-full w-full cursor-pointer flex-col text-left disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            "line-clamp-2 whitespace-pre-wrap break-words pl-7 pr-6 text-[13px] leading-relaxed",
            completed ? "text-[#999999] line-through" : "text-[#000000]",
          )}
        >
          {todo.title}
        </span>
        <span className="mt-auto pl-7 text-[10px] text-[#999999]">
          {formatDateTime(todo.createdAt)}
        </span>
      </button>
    </article>
  );
}
