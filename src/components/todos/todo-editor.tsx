"use client";

import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { TODO_TITLE_MAX_LENGTH, charLength } from "@/lib/todos/validate";

/**
 * 待办的新建 / 编辑编辑器（两者共用一个弹窗壳）。
 *
 * 与便签编辑器同一套外观：`textarea` 无边框、自动长高、`Esc` 取消、
 * 字数提示只在接近上限（≥ 900）时出现；挂载即聚焦并滚到视口中间
 * （移动端键盘弹出会改变视口，不滚的话输入框容易被顶出屏幕）。
 *
 * 唯一的不同在键盘：待办通常只有一句话，**回车即保存**、`Shift + Enter` 才换行
 * （`⌘/Ctrl + Enter` 同样保存）——便签是长文本，回车必须留给换行。
 *
 * 编辑已有待办时，左下角补一行「创建于 YYYY-MM-DD HH:mm」——卡片上只显示时间，
 * 这里给出它属于「创建时间」的上下文。
 */

interface TodoEditorProps {
  initialValue?: string;
  /** 编辑已有待办时传入创建时间；新建时不传。 */
  createdAt?: number;
  busy: boolean;
  error?: string | null;
  onSave: (title: string) => void;
  /** 删除当前这条；只在编辑已有待办时传，新建时不传（不渲染按钮）。 */
  onDelete?: () => void;
  onCancel: () => void;
}

export function TodoEditor({
  initialValue = "",
  createdAt,
  busy,
  error,
  onSave,
  onDelete,
  onCancel,
}: TodoEditorProps) {
  const [value, setValue] = useState(initialValue);
  /** 删除要不要二次确认：点「删除」先出确认条，确认后才真删（Modal 关闭即卸载本组件，状态自然复位）。 */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动长高：行内高度先归零再取 scrollHeight，删字时才会跟着缩回去
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.focus();
    element.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const submit = () => {
    if (!busy) onSave(value);
  };

  const length = charLength(value);
  const meta = [
    createdAt === undefined
      ? null
      : `创建于 ${formatDateTime(createdAt)}`,
    length >= 900 ? `${length}/${TODO_TITLE_MAX_LENGTH}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // 待办一般只有一句话：回车直接保存，Shift + Enter 才换行（⌘/Ctrl + Enter 同样保存）
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="写一条待办…"
        maxLength={TODO_TITLE_MAX_LENGTH}
        aria-label="待办内容"
        className="min-h-[120px] w-full flex-1 resize-none overflow-y-auto rounded-[2px] border border-[#E5E5E5] bg-white p-3 text-[13px] leading-relaxed text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000] sm:max-h-[50vh] sm:flex-none sm:min-h-[180px]"
      />

      {error ? <p className="text-xs text-[#B91C1C]">{error}</p> : null}

      {/* 删除要一次确认：点「删除」先把这一条换成「取消 / 确认删除」，
          确认后才真删——删除不可撤销，误点一次就没了（2026-10-22 联调） */}
      {confirmingDelete ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-[#E5E5E5] bg-[#F5F5F5] px-3 py-2">
          <span className="text-xs text-[#666666]">
            删除后无法恢复，确定删除这条待办？
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              className="h-6 cursor-pointer rounded-[2px] bg-white px-2.5 text-xs text-[#666666] transition-colors hover:bg-[#ECECEC] disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消删除
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="h-6 cursor-pointer rounded-[2px] bg-[#000000] px-2.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50"
            >
              确认删除
            </button>
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[10px] tabular-nums text-[#999999]">
          {meta}
        </span>

        <div className="flex shrink-0 items-center gap-2">
          {onDelete && !confirmingDelete ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                className="h-7 cursor-pointer rounded-[2px] bg-[#F5F5F5] px-3 text-xs font-medium text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                删除
              </button>
              {/* 与右侧「取消 / 保存」隔一道 1px 线：不可撤销的动作别和常规按钮挤在一起 */}
              <span aria-hidden="true" className="h-4 w-px bg-[#E5E5E5]" />
            </>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-7 cursor-pointer rounded-[2px] bg-[#F5F5F5] px-3 text-xs font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-7 cursor-pointer rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
