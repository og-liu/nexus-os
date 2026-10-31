"use client";

import { useEffect, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * 通用模态框（《界面设计规范》§7.13 的浮层形态）。
 *
 * 两种形态、一套 DOM，用断点切换（sm = 640px）：
 * - **移动端（< sm）**：全屏，像单开一页——顶部「标题 + 关闭」、内容区占满、
 *   底部操作贴安全区；键盘弹出时内容区自己滚动。
 * - **桌面（≥ sm）**：居中卡片，宽 640px、高度上限 75vh。
 *
 * 全屏形态没有遮罩（背景被完全覆盖）；桌面才渲染遮罩层：`bg-black/25` + `backdrop-blur-sm`
 * （《界面设计规范》§5.4「浮层遮罩」，与手机抽屉同一套观感）。
 * 只负责「壳」：Esc / 关闭按钮 / 点遮罩关闭、打开时锁背景滚动。内容由调用方给。
 */
interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * 桌面形态（≥ sm）右上角也画一个 ×。
   *
   * 默认不开：确认框这类「只有两个明确选项」的弹窗多一个 × 是干扰。
   * 内容较长的面板（标签管理）才需要——手机上本来就有顶栏的 ×，桌面没有就只剩 Esc 和点遮罩。
   */
  showCloseButton?: boolean;
  /**
   * 内容区怎么排：
   * - `"auto"`（默认）：按内容高度自适应，表单类弹窗用；
   * - `"fill"`：弹窗桌面态给一个固定高度、内容区自己撑满并滚动。
   *   **长列表必须用这个**——`auto` 下内容区是块级、按内容撑高，里面的 `flex-1 overflow-y-auto`
   *   拿不到高度，列表一长就把整个弹窗撑破 `max-h-[75vh]`，顶部的标题和底部的按钮全被挤出可视区。
   */
  bodyLayout?: "auto" | "fill";
}

export function Modal({
  open,
  title,
  onClose,
  children,
  showCloseButton = false,
  bodyLayout = "auto",
}: ModalProps) {
  const fill = bodyLayout === "fill";
  // 打开时锁背景滚动：不锁的话，手指在遮罩上划，底下的列表会跟着滚
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Esc 关闭（编辑器里的 Esc 由编辑器自己处理，这里兜住「点遮罩关闭」之外的键盘出口）
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // 只在点到遮罩层本身时关闭：点弹窗内部（哪怕冒泡上来）不关
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:items-center sm:justify-center sm:bg-transparent sm:p-4">
      {/* 桌面遮罩：移动端是全屏白底、没有遮罩可点，所以这里不渲染点击区域。
          半透明 + 轻微毛玻璃（主流浮层做法）：背景退后一层，但还看得见，不压暗整页。 */}
      <div
        aria-hidden="true"
        onClick={handleBackdropClick}
        className="absolute inset-0 hidden bg-black/25 backdrop-blur-sm sm:block"
      />
      {/* 移动端全屏页头：标题 + 关闭；桌面隐藏，标题回到卡片内 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#F0F0F0] px-4 sm:hidden">
        <h2 className="text-sm font-semibold text-[#000000]">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[2px] text-[#666666] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000]"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          fill
            ? "relative z-10 flex min-h-0 w-full flex-1 flex-col bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:h-[720px] sm:max-h-[80vh] sm:max-w-[680px] sm:rounded-[2px] sm:p-6"
            : "relative z-10 flex min-h-0 w-full flex-1 flex-col bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:max-h-[75vh] sm:flex-none sm:max-w-[640px] sm:rounded-[2px] sm:p-6"
        }
      >
        <h2 className="hidden shrink-0 pr-8 text-sm font-semibold text-[#000000] sm:block">
          {title}
        </h2>
        {showCloseButton ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="absolute right-3 top-3 hidden h-8 w-8 cursor-pointer items-center justify-center rounded-[2px] text-[#8A8A8A] transition-colors hover:bg-[#F5F5F5] hover:text-[#000000] sm:flex"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <div
          className={
            fill
              ? "mt-3 flex min-h-0 flex-1 flex-col"
              : "mt-3 flex min-h-0 flex-1 flex-col sm:mt-3 sm:block sm:flex-none"
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}
