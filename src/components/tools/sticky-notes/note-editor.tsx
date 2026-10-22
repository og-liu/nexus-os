"use client";

import { useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { NOTE_BODY_MAX_LENGTH, charLength } from "@/lib/sticky-notes/validate";

/**
 * 便签的原地编辑器（新建空卡与编辑已有便签共用）。
 *
 * - `textarea` 无边框、与白卡同色，卡片本身就是编辑器的外壳；
 * - 自动长高：每次输入把 `height` 设为 `scrollHeight`，长便签不出现内部滚动条；
 * - 快捷键：`⌘/Ctrl + Enter` 保存、`Esc` 取消；
 * - 「置顶保存」= 保存 + 置顶一步完成：编辑完不用再滚回列表里找它、再点置顶；
 *   底部三个按钮只有两层样式：灰色次要（取消 / 置顶保存）+ 黑色主操作（保存），
 *   同高度、同圆角、同字号，不加图标与描边；
 * - 编辑已有便签时，左下角补一行「创建于 YYYY-MM-DD HH:mm」，与待办编辑器同款；
 * - 字数提示只在 ≥ 900 时出现（1000 是上限，按字符数计），与创建时间并列显示。
 *
 * 焦点：挂载时自动聚焦，并把卡片滚到视口中间——移动端键盘弹出会改变视口，
 * 不滚的话输入框容易被顶出屏幕（《功能/便签》已知的坑）。
 */

interface NoteEditorProps {
  initialValue?: string;
  /** 编辑已有便签时传入创建时间；新建时不传。 */
  createdAt?: number;
  busy: boolean;
  error?: string | null;
  onSave: (body: string) => void;
  /** 保存并置顶；不传则不渲染这个按钮。 */
  onSavePinned?: (body: string) => void;
  onCancel: () => void;
}

export function NoteEditor({
  initialValue = "",
  createdAt,
  busy,
  error,
  onSave,
  onSavePinned,
  onCancel,
}: NoteEditorProps) {
  const [value, setValue] = useState(initialValue);
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

  const submitPinned = () => {
    if (!busy) onSavePinned?.(value);
  };

  const length = charLength(value);
  const meta = [
    createdAt === undefined ? null : `创建于 ${formatDateTime(createdAt)}`,
    length >= 900 ? `${length}/${NOTE_BODY_MAX_LENGTH}` : null,
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
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="写点什么…"
        maxLength={NOTE_BODY_MAX_LENGTH}
        aria-label="便签正文"
        className="min-h-[160px] w-full flex-1 resize-none overflow-y-auto rounded-[2px] border border-[#E5E5E5] bg-white p-3 text-[13px] leading-relaxed text-[#000000] placeholder:text-[#999999] outline-none focus:border-[#000000] sm:max-h-[50vh] sm:flex-none sm:min-h-[240px]"
      />

      {error ? <p className="text-xs text-[#B91C1C]">{error}</p> : null}

      <div className="flex items-center justify-between gap-3">
        {/* 左下角：创建时间（编辑时）+ 字数提示（接近上限时），与待办编辑器同一套 */}
        <span className="min-w-0 truncate text-[10px] tabular-nums text-[#999999]">
          {meta}
        </span>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-7 cursor-pointer rounded-[2px] bg-[#F5F5F5] px-3 text-xs font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          {onSavePinned ? (
            <button
              type="button"
              onClick={submitPinned}
              disabled={busy}
              className="h-7 cursor-pointer rounded-[2px] bg-[#F5F5F5] px-3 text-xs font-medium text-[#666666] disabled:cursor-not-allowed disabled:opacity-50"
            >
              置顶保存
            </button>
          ) : null}
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
