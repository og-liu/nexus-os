"use client";

import { useEffect, useRef, useState } from "react";
import { NOTE_BODY_MAX_LENGTH, charLength } from "@/lib/sticky-notes/validate";

/**
 * 便签的原地编辑器（新建空卡与编辑已有便签共用）。
 *
 * - `textarea` 无边框、与白卡同色，卡片本身就是编辑器的外壳；
 * - 自动长高：每次输入把 `height` 设为 `scrollHeight`，长便签不出现内部滚动条；
 * - 快捷键：`⌘/Ctrl + Enter` 保存、`Esc` 取消；
 * - 字数提示只在 ≥ 900 时出现（1000 是上限，按字符数计）。
 *
 * 焦点：挂载时自动聚焦，并把卡片滚到视口中间——移动端键盘弹出会改变视口，
 * 不滚的话输入框容易被顶出屏幕（《功能/便签》已知的坑）。
 */

interface NoteEditorProps {
  initialValue?: string;
  busy: boolean;
  error?: string | null;
  onSave: (body: string) => void;
  onCancel: () => void;
}

export function NoteEditor({
  initialValue = "",
  busy,
  error,
  onSave,
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

  const length = charLength(value);

  return (
    <div className="flex flex-col gap-2">
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
        className="min-h-[72px] w-full resize-none bg-white text-[13px] leading-relaxed text-[#000000] placeholder:text-[#999999] outline-none"
      />

      {error ? <p className="text-xs text-[#B91C1C]">{error}</p> : null}

      <div className="flex items-center justify-between">
        {/* 字数提示只在接近上限时出现，平时不打扰 */}
        <span className="text-[10px] tabular-nums text-[#999999]">
          {length >= 900 ? `${length}/${NOTE_BODY_MAX_LENGTH}` : ""}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-7 rounded-[2px] px-3 text-xs text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000] disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-7 rounded-[2px] bg-[#000000] px-3 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
