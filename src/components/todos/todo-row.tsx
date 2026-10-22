"use client";

import { Check } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * 首页「待办清单」卡里的勾选行（《界面设计规范》§7.19）。
 *
 * 首页保留紧凑的行形态（工具页才是卡片网格）：整行可点、点哪儿都能勾，
 * 标题下面是创建时间（精确到分钟，与便签卡、待办卡同一份格式）。
 *
 * **行本身不是 `<button>`**：行内点击只切换完成态，不承载其他按钮。
 * 键盘可达：行可聚焦，Enter / 空格切换——刻意不加 `role="button"`，
 * 保留内容语义比一个空壳按钮角色更诚实。
 */
interface TodoRowProps {
  title: string;
  /** 创建时间（毫秒），显示为 `YYYY-MM-DD HH:mm`。 */
  createdAt: number;
  /** 完成态：黑底白勾 + 标题灰划线。 */
  completed: boolean;
  onToggle: () => void;
  /** 写操作进行中：整行忽略点击，避免连点重复提交。 */
  disabled?: boolean;
}

export function TodoRow({
  title,
  createdAt,
  completed,
  onToggle,
  disabled = false,
}: TodoRowProps) {
  return (
    <div
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!disabled) onToggle();
      }}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-[2px] p-2 text-left transition-colors hover:bg-[#F5F5F5]",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border transition-colors",
          completed
            ? "border-[#000000] bg-[#000000]"
            : "border-[#D0D0D0] bg-white",
        )}
      >
        {completed ? <Check className="h-3 w-3 text-white" /> : null}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "line-clamp-2 whitespace-pre-wrap break-words text-sm",
            completed ? "text-[#999999] line-through" : "text-[#000000]",
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-[10px] text-[#999999]">
          {formatDateTime(createdAt)}
        </span>
      </span>
    </div>
  );
}
