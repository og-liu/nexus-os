"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 「编辑器 + 预览」两栏之间的可拖拽分割条（《功能/Markdown编辑器》§2.6）。
 *
 * 三条实现上的选择：
 * 1. **Pointer Events + `setPointerCapture`**，不用 mousedown/mousemove：指针拖出容器
 *    也不会丢事件，触控板 / 触屏笔一样能拖；
 * 2. **比例用百分比**，不用像素：窗口或左栏宽度变了，两边按比例缩放，不会把某一栏挤没；
 * 3. **`requestAnimationFrame` 节流**：拖动一次会来几十个 `pointermove`，每帧最多
 *    更新一次宽度，避免一帧里反复渲染。
 *
 * 比例**不持久化**（联调定：刷新就回到默认 1:1），所以这里只管「这一刻拖到哪」。
 */

/** 两栏各自的最小宽度（px）。再小的话预览里的表格会挤成一列、工具栏要横滚很久。 */
const MIN_EDITOR_PX = 360;
const MIN_PREVIEW_PX = 320;
/** 分割条自己的宽度（热区 6px）。算预览宽度时必须把它扣掉，否则右边总差 6px。 */
const DIVIDER_PX = 6;

/**
 * 把「编辑区占容器的比例」夹进允许范围。
 *
 * 编辑区宽 = `ratio × 容器宽`；预览宽 = `容器宽 − 分割条 − 编辑区宽`。
 * 两边各有下限，容器太窄时下限自动缩到各占一半的一半，保证还能拖。
 */
export function clampRatio(ratio: number, containerWidth: number): number {
  if (!Number.isFinite(ratio) || containerWidth <= 0) return 0.5;

  const usable = Math.max(containerWidth - DIVIDER_PX, 1);
  const minEditorPx = Math.min(MIN_EDITOR_PX, usable * 0.5);
  const minPreviewPx = Math.min(MIN_PREVIEW_PX, usable * 0.5);

  const minRatio = minEditorPx / containerWidth;
  const maxRatio = (usable - minPreviewPx) / containerWidth;
  if (maxRatio <= minRatio) return 0.5;

  return Math.min(Math.max(ratio, minRatio), maxRatio);
}

interface SplitDividerProps {
  /** 两栏所在的那一行：用它量容器宽度、算指针落在哪。 */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 拖动中回调新的「编辑区占比」（已夹过边界）。 */
  onRatioChange: (ratio: number) => void;
  className?: string;
}

export function SplitDivider({ containerRef, onRatioChange, className }: SplitDividerProps) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  /** 恢复拖动时临时改掉的全局样式（指针在窗口外松开也不会卡住）。 */
  const resetBodyStyles = useCallback(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      resetBodyStyles();
    };
  }, [resetBodyStyles]);

  /** 一帧最多算一次：把这一帧里最后一次的位置交给父组件。 */
  const scheduleRatio = useCallback(
    (ratio: number) => {
      pendingRef.current = ratio;
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        if (pendingRef.current !== null) onRatioChange(pendingRef.current);
      });
    },
    [onRatioChange],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setDragging(true);
    // 拖动时整页都保持「左右箭头」且不许选中文字，否则会拖出一片蓝色选区
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) return;
    scheduleRatio(clampRatio((event.clientX - rect.left) / rect.width, rect.width));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    resetBodyStyles();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整编辑器与预览的宽度"
      // 热区 6px、视觉仍是 1px 线：线太细不好按，加宽又会让两栏看着分开
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "group relative w-1.5 shrink-0 cursor-col-resize touch-none select-none bg-white",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors",
          dragging ? "bg-[#1F1F1F]" : "bg-[#F0F0F0] group-hover:bg-[#8A8A8A]",
        )}
      />
    </div>
  );
}
