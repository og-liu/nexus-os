"use client";

import {
  Bold,
  Code,
  Code2,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FormatKind } from "@/lib/markdown/format";

/**
 * 格式工具栏（《功能/Markdown编辑器》§二 2.3、《界面设计规范》§7.25.4）。
 *
 * **按钮必须在 `onMouseDown` 里 `preventDefault()`**：不这么做，点按钮的瞬间 textarea
 * 失焦、`selectionStart/End` 归零，格式就打到了光标位置而不是选中的文字上——
 * 表现为「粗体只作用在空处」，是最容易踩的一处（§七 已知的坑）。
 *
 * 只放 9 个格式按钮。**版式开关不在这里**：它住在贯穿整页的标题行（三档：仅编辑器 /
 * 编辑器 + 预览 / 仅预览），因为「仅预览」时编辑区整块让位，开关跟着它一起消失就没法切回来。
 */

interface ToolbarButton {
  kind: FormatKind;
  label: string;
  icon: LucideIcon;
}

/** 顺序即界面上的顺序，与《功能/Markdown编辑器》§二 2.3 的表一致。 */
const BUTTONS: ToolbarButton[] = [
  { kind: "bold", label: "粗体", icon: Bold },
  { kind: "italic", label: "斜体", icon: Italic },
  { kind: "code", label: "行内代码", icon: Code },
  { kind: "heading", label: "标题", icon: Heading },
  { kind: "bullet", label: "无序列表", icon: List },
  { kind: "ordered", label: "有序列表", icon: ListOrdered },
  { kind: "quote", label: "引用", icon: Quote },
  { kind: "codeblock", label: "代码块", icon: Code2 },
  { kind: "link", label: "链接", icon: LinkIcon },
];

interface FormatToolbarProps {
  onFormat: (kind: FormatKind) => void;
  className?: string;
}

export function FormatToolbar({ onFormat, className }: FormatToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="格式工具栏"
      // 一行放得下；放不下时横向滚动，不换行（换行会把正文区挤矮）
      className={cn(
        "flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[#F0F0F0] bg-[#FAFAFA] px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {BUTTONS.map(({ kind, label, icon: Icon }) => (
        <button
          key={kind}
          type="button"
          title={label}
          aria-label={label}
          // 保住 textarea 的焦点与选区：没有这一行，格式会打错地方
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFormat(kind)}
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#ECECEC] hover:text-[#000000]"
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ))}

    </div>
  );
}
