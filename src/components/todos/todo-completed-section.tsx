"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 工具页的「已完成」折叠区（《功能/待办清单》§2.2）。
 *
 * 用的是全站统一的分组标题形态（黑竖条 + 13px 标题 + 弱化计数，§7.2）：
 * 「未完成」那一组也是同样的标题，两组标题把「工具信息 → 列表」的过渡接上，
 * 页面不再是一块大白卡直接怼进一片卡片。
 *
 * 标题行本身是按钮（展开 / 收起），「清除已完成」是它的兄弟按钮——不嵌套。
 * 清除走原位二次确认，不弹全局对话框；没有已完成时整个组件不渲染。
 */
interface TodoCompletedSectionProps {
  count: number;
  expanded: boolean;
  busy: boolean;
  /** 清除的二次确认态（由调用方维护，和其他行的确认互斥）。 */
  confirmingClear: boolean;
  onToggleExpanded: () => void;
  onRequestClear: () => void;
  onCancelClear: () => void;
  onConfirmClear: () => void;
  /** 展开后的卡片网格（由调用方渲染，卡片本身与未完成区共用）。 */
  children?: ReactNode;
}

export function TodoCompletedSection({
  count,
  expanded,
  busy,
  confirmingClear,
  onToggleExpanded,
  onRequestClear,
  onCancelClear,
  onConfirmClear,
  children,
}: TodoCompletedSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex min-h-7 items-center gap-2">
        {confirmingClear ? (
          <>
            <p className="min-w-0 flex-1 text-xs text-[#8A8A8A]">
              清除 {count} 条已完成的待办？
            </p>
            <button
              type="button"
              onClick={onConfirmClear}
              disabled={busy}
              className="h-6 shrink-0 cursor-pointer rounded-[2px] bg-[#000000] px-2.5 text-xs font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:opacity-50"
            >
              清除
            </button>
            <button
              type="button"
              onClick={onCancelClear}
              disabled={busy}
              className="h-6 shrink-0 cursor-pointer rounded-[2px] bg-[#F5F5F5] px-2.5 text-xs text-[#666666] disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
            >
              <span className="h-3.5 w-[3px] shrink-0 bg-[#000000]" />
              <span className="text-sm font-semibold text-[#000000]">已完成</span>
              <span className="text-xs tabular-nums text-[#999999]">
                {count}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-[#8A8A8A] transition-transform group-hover:text-[#000000]",
                  expanded && "rotate-180",
                )}
              />
            </button>
            <button
              type="button"
              onClick={onRequestClear}
              className="shrink-0 cursor-pointer text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
            >
              清除已完成
            </button>
          </>
        )}
      </div>

      {children}
    </section>
  );
}
