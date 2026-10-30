"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

/**
 * 自定义字段的拖拽排序（《功能/保险库》§四「字段排序」）。
 *
 * **为什么手写而不引 dnd-kit**：这段排序只服务于弹窗里几行字段，
 * 引入 `@dnd-kit/core` + `@dnd-kit/sortable`（~40KB）换来的能力在这里用不上。
 * 行高固定，位移 ÷ 行高就是目标下标，算法本身只有十几行。
 *
 * 三条实现要求：
 * 1. **只认按下的那根指针**（`pointerId`）：多指触摸时，另一根手指不能抢走拖动；
 * 2. **越过半行才换位**：位移到半行高就交换，手感与系统列表一致；
 * 3. **键盘也要能排序**：只在把手上支持指针拖拽，对只用键盘的人等于这个功能不存在——
 *    所以把手是 `button`，`↑` / `↓` 把当前行上移 / 下移一位。
 *
 * 调用方负责行高一致（每行同高、间距固定），否则「位移 ÷ 行高」算出来的下标会错。
 */

/** 行与行之间的 `gap`（与 item-dialog 里的 `space-y-2` 对齐，单位 px）。 */
const ROW_GAP = 8;

interface DragState {
  index: number;
  startY: number;
  /** 一行的高度 + 间距，换位的判定阈值就是它的一半 */
  step: number;
}

export function useFieldDrag(
  count: number,
  onReorder: (from: number, to: number) => void,
) {
  /** 正在被拖的行下标（不拖时为 null，用来加拖动样式）。 */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  /** 手指相对起始位置的偏移，用来让被拖的行跟着走。 */
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const state = useRef<DragState>({ index: 0, startY: 0, step: 52 });
  const activePointer = useRef<number | null>(null);

  const stop = useCallback(() => {
    activePointer.current = null;
    setDragging(false);
    setDragIndex(null);
    setOffset(0);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: globalThis.PointerEvent) => {
      // 只跟按下的那根手指；第二根手指移动时直接忽略
      if (activePointer.current !== null && event.pointerId !== activePointer.current) return;

      const delta = event.clientY - state.current.startY;
      const half = state.current.step / 2;

      if (delta > half && state.current.index < count - 1) {
        const from = state.current.index;
        onReorder(from, from + 1);
        // 基准随之上移一行：视觉上那行还在手指下面，不会跳回去
        state.current.index = from + 1;
        state.current.startY += state.current.step;
        setDragIndex(from + 1);
        setOffset(delta - state.current.step);
        return;
      }

      if (delta < -half && state.current.index > 0) {
        const from = state.current.index;
        onReorder(from, from - 1);
        state.current.index = from - 1;
        state.current.startY -= state.current.step;
        setDragIndex(from - 1);
        setOffset(delta + state.current.step);
        return;
      }

      setOffset(delta);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging, count, onReorder, stop]);

  /**
   * 把手的 pointerdown。`row` 用来量行高——**必须量，不能写死**：
   * 移动端字段行是上下堆叠的，比桌面的两列更高。
   */
  const startDrag = useCallback((index: number, event: PointerEvent<HTMLElement>, row: HTMLElement | null) => {
    // 只认主键（鼠标左键 / 单指触摸）；右键与中键不触发拖拽
    if (event.button !== 0 || count < 2) return;
    event.preventDefault();

    const height = row?.getBoundingClientRect().height ?? 44;
    state.current = { index, startY: event.clientY, step: height + ROW_GAP };
    activePointer.current = event.pointerId;
    setDragging(true);
    setDragIndex(index);
    setOffset(0);
  }, [count]);

  /** 把手的键盘排序：↑ 上移、↓ 下移（带 8px 的视觉位移，跟指针拖动一致）。 */
  const moveByKeyboard = useCallback(
    (index: number, event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "ArrowUp" && index > 0) {
        event.preventDefault();
        onReorder(index, index - 1);
      } else if (event.key === "ArrowDown" && index < count - 1) {
        event.preventDefault();
        onReorder(index, index + 1);
      }
    },
    [count, onReorder],
  );

  return { dragIndex, offset, startDrag, moveByKeyboard };
}
