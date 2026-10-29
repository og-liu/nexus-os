"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Dices, Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 弹窗里的一行自定义字段（《功能/保险库》§2.5）。
 *
 * 三种控件挤在一行里，各自回答一个问题：
 * - `⋮⋮` 把手：**能不能改顺序**（拖它 / 聚焦后按 ↑↓）
 * - 字段名 + 值：这条记录有什么
 * - 🎲 / 🗑：这个值要不要换一个新的 / 这一行还要不要
 *
 * 拖拽时整行跟手（`transform: translateY`），不用 `position: fixed`：
 * 固定定位会让行脱离文档流、列表高度塌一下，用户会看到闪烁。
 */

/** 编辑中的字段：多一个 `uid`，因为字段本身没有 id，拖拽与 React key 都需要一个稳定的标识。 */
export interface DraftField {
  uid: string;
  key: string;
  value: string;
}

interface FieldRowProps {
  field: DraftField;
  index: number;
  dragging: boolean;
  offset: number;
  /** 这一行的值当前看不看得见。新建时默认看得见（你在编辑，得确认自己敲了什么）。 */
  revealed: boolean;
  onToggleReveal: (index: number) => void;
  onStartDrag: (index: number, event: PointerEvent<HTMLElement>, row: HTMLElement | null) => void;
  onMoveByKeyboard: (index: number, event: KeyboardEvent<HTMLElement>) => void;
  onChange: (index: number, patch: Partial<Pick<DraftField, "key" | "value">>) => void;
  onGenerate: (index: number) => void;
  onRemove: (index: number) => void;
}

export function FieldRow({
  field,
  index,
  dragging,
  offset,
  revealed,
  onToggleReveal,
  onStartDrag,
  onMoveByKeyboard,
  onChange,
  onGenerate,
  onRemove,
}: FieldRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rowRef}
      data-field-row=""
      style={dragging ? { transform: `translateY(${offset}px)` } : undefined}
      className={cn(
        "flex items-start gap-1.5 rounded-[2px]",
        dragging ? "relative z-10 bg-white shadow-sm ring-1 ring-[#000000]/10" : "",
      )}
    >
      {/* 把手：触摸时要 `touch-action: none`，否则浏览器把拖动当成页面滚动 */}
      <button
        type="button"
        aria-label={`拖动「${field.key || "新字段"}」调整顺序，或用上下方向键移动`}
        onPointerDown={(event) => onStartDrag(index, event, rowRef.current)}
        onKeyDown={(event) => onMoveByKeyboard(index, event)}
        className="mt-1.5 flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-[2px] text-[#C4C4C4] hover:bg-[#F5F5F5] hover:text-[#8A8A8A] active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row">
        <input
          type="text"
          value={field.key}
          onChange={(event) => onChange(index, { key: event.target.value })}
          placeholder="字段名"
          aria-label={`第 ${index + 1} 个字段的名字`}
          className="h-9 w-full shrink-0 rounded-[2px] border border-[#E5E5E5] bg-white px-2 text-[13px] text-[#1F1F1F] outline-none placeholder:text-[#A0A8B4] focus:border-[#000000] sm:w-40"
        />
        <input
          type={revealed ? "text" : "password"}
          value={field.value}
          onChange={(event) => onChange(index, { value: event.target.value })}
          placeholder="值"
          aria-label={`第 ${index + 1} 个字段的值`}
          className="h-9 min-w-0 flex-1 rounded-[2px] border border-[#E5E5E5] bg-white px-2 text-[13px] text-[#1F1F1F] outline-none placeholder:text-[#A0A8B4] focus:border-[#000000]"
        />
      </div>

      <div className="flex shrink-0 items-center gap-0.5 pt-1">
        {/* 眼睛：默认睁开（值看得见），点一下变圆点（`type="password"` 是浏览器原生遮挡）。
            外面（右栏）默认是遮挡的、点开才露——两处方向相反，因为「编辑」和「查看」是两种场合 */}
        <button
          type="button"
          onClick={() => onToggleReveal(index)}
          aria-label={revealed ? "隐藏这个值" : "显示这个值"}
          aria-pressed={!revealed}
          title={revealed ? "隐藏" : "显示"}
          className="flex h-7 w-7 items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
        >
          {revealed ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => onGenerate(index)}
          aria-label="生成随机密码填进这一行"
          title="生成随机密码"
          className="flex h-7 w-7 items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
        >
          <Dices className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label="删除这个字段"
          title="删除字段"
          className="flex h-7 w-7 items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#FEF2F2] hover:text-[#B91C1C]"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
