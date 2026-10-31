"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyFormat, type FormatKind } from "@/lib/markdown/format";
import { charCount } from "@/lib/markdown/validate";
import { FormatToolbar } from "./format-toolbar";
import type { SaveStatus } from "./use-autosave";

/**
 * 编辑区（《功能/Markdown编辑器》§二 2.3、《界面设计规范》§7.25.4）。
 *
 * **只管正文这一段**：工具栏 + textarea + 状态栏。标题与版式开关住在贯穿整页的
 * 标题行（`editor-top-bar.tsx`），因为「只看预览」那一档要把整块编辑区让出去，
 * 开关不能跟着一起消失。
 *
 * 编辑器是**原生 `<textarea>`**（§四「编辑控件」）：Markdown 原文和输入框内容本来就
 * 一一对应，输入即输出，不需要 `contenteditable` 那套 HTML↔Markdown 双向转换。
 */

interface EditorPaneProps {
  body: string;
  onBodyChange: (value: string) => void;
  /** 有没有打开一篇文档：没有时输入框不可编辑（改了也没处存）。 */
  hasDocument: boolean;
  status: SaveStatus;
  onRetry: () => void;
  onCopy: () => void;
  onExport: () => void;
  onComposingChange: (composing: boolean) => void;
  /** 手机档的文档切换条（chips）；只有 < md 由它承担切换，≥ md 用左栏 / 抽屉。 */
  mobileDocNav?: ReactNode;
  /** 这篇文档的标签条（工具栏下方）；「仅预览」时整个编辑区都在隐藏，自动跟着不显示。 */
  tagBar?: ReactNode;
  /** 「编辑器 + 预览」时由分割条决定宽度（`flex-basis`）。 */
  style?: CSSProperties;
  className?: string;
}

/** Tab 插入的缩进：两个空格（编辑器里的通用预期）。 */
const TAB_INDENT = "  ";

export function EditorPane({
  body,
  onBodyChange,
  hasDocument,
  status,
  onRetry,
  onCopy,
  onExport,
  onComposingChange,
  mobileDocNav,
  tagBar,
  style,
  className,
}: EditorPaneProps) {
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * 工具栏点一下 = 改写选区。`applyFormat` 是纯函数，这里只负责把结果写回 textarea
   * 并**恢复选区**（下一帧再设位置：这一帧 React 还没把新 value 刷到 DOM 上）。
   */
  const handleFormat = (kind: FormatKind) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const result = applyFormat(body, { start, end }, kind);
    onBodyChange(result.text);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(result.start, result.end);
    });
  };

  /** Tab 在正文里插入两个空格（Shift+Tab 不拦截：键盘用户要能离开输入框）。 */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab" || event.shiftKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();

    const textarea = event.currentTarget;
    const { selectionStart, selectionEnd } = textarea;
    const nextBody = body.slice(0, selectionStart) + TAB_INDENT + body.slice(selectionEnd);
    onBodyChange(nextBody);

    const cursor = selectionStart + TAB_INDENT.length;
    requestAnimationFrame(() => {
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const statusText =
    status === "saving" ? "保存中…" : status === "error" ? "保存失败，重试" : "已保存";

  return (
    <div style={style} className={cn("flex min-w-0 flex-col bg-white", className)}>
      {mobileDocNav}

      <FormatToolbar onFormat={handleFormat} />

      {tagBar}

      <textarea
        ref={bodyRef}
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => onComposingChange(true)}
        onCompositionEnd={() => onComposingChange(false)}
        placeholder="在这里写 Markdown…"
        aria-label="文档正文"
        spellCheck={false}
        disabled={!hasDocument}
        // 手机上必须是 16px：iOS 对更小字号的输入框聚焦时会缩放整页（§七 已知的坑）
        className="min-h-0 flex-1 resize-none border-0 bg-transparent px-4 py-3 text-[16px] text-[#1F1F1F] outline-none placeholder:text-[#C4C4C4] disabled:cursor-not-allowed sm:font-mono sm:text-[13px] sm:leading-[1.7]"
      />

      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-t border-[#F0F0F0] px-3 text-[11px]">
        {status === "error" ? (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 cursor-pointer whitespace-nowrap text-[#B91C1C] transition-colors hover:underline"
          >
            {statusText}
          </button>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-[#999999]">{statusText}</span>
        )}

        <div className="flex items-center gap-1">
          <span className="shrink-0 whitespace-nowrap text-[#999999]">{charCount(body)} 字</span>
          {/*
            「复制」「导出 .md」：≥ sm 是文字按钮，手机上收成图标。
            375px 下三个文字挤在一行会把「已保存」「复制」「导出 .md」各折成两行（2026-10-31 修）。
            aria-label 与 title 两种宽度都有，图标形态不至于变成谜语。
          */}
          <button
            type="button"
            onClick={onCopy}
            disabled={!hasDocument}
            aria-label="复制 Markdown"
            title="复制 Markdown"
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[11px] text-[#666666] transition-colors hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:w-auto sm:px-2"
          >
            <Copy className="h-3.5 w-3.5 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">复制</span>
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={!hasDocument}
            aria-label="导出 .md"
            title="导出 .md"
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[11px] text-[#666666] transition-colors hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:w-auto sm:px-2"
          >
            <Download className="h-3.5 w-3.5 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">导出 .md</span>
          </button>
        </div>
      </div>
    </div>
  );
}
