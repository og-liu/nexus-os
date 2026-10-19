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
 * 全屏形态没有遮罩（背景被完全覆盖）；桌面才需要 `sm:bg-black/40` 的遮罩层。
 * 只负责「壳」：Esc / 关闭按钮 / 点遮罩关闭、打开时锁背景滚动。内容由调用方给。
 */
interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
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
        className="relative z-10 flex min-h-0 w-full flex-1 flex-col bg-white p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:max-h-[75vh] sm:flex-none sm:max-w-[640px] sm:rounded-[2px] sm:p-6"
      >
        <h2 className="hidden shrink-0 text-sm font-semibold text-[#000000] sm:block">
          {title}
        </h2>
        <div className="mt-3 flex min-h-0 flex-1 flex-col sm:mt-3 sm:block sm:flex-none">
          {children}
        </div>
      </div>
    </div>
  );
}
