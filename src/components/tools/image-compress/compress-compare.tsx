"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronsLeftRight } from "lucide-react";

/**
 * 原图 / 压缩后的对比滑块（《功能/图片压缩》§2.1）。
 *
 * 左边原图、右边压缩后，中间一条竖线 + 中间一个抓手，按住左右拖（AI 绘图工具里
 * 最常见的 before/after 对比）。2026-10-30 联调用来替掉「看原图 / 看压缩后」
 * 那颗按钮：按钮要点两次才能比出差别，分割线一眼就能看见两版的接缝。
 *
 * 实现要点：
 * - **位置按图片的显示矩形算，不按容器算**：竖图在宽容器里左右留白，
 *   用容器百分比的话，拖到最左/最右仍是一整张图，很怪。这里用源图宽高比 +
 *   容器尺寸算出图片实际占的矩形（`fit`），分割线只在图片范围内走。
 * - 原图由预览区那层 `<img>` 负责（它还决定容器高度），这里只画**压缩后的右半边**：
 *   用 `clip-path: inset(0 0 0 X)` 裁掉左侧。
 * - 显示尺寸**不放大**（和原图那张 `<img>` 的 `max-w/max-h` 行为一致）：小图在
 *   大容器里仍然是原尺寸，不会因为 object-contain 被撑大而和原图错位。
 * - 鼠标 / 触屏 / 触控笔统一走 Pointer Events + `setPointerCapture`；触屏
 *   `touch-action: pan-y`，左右拖归滑块、上下滑仍然滚页面。
 * - 键盘：抓手可 Tab 聚焦，方向键 2%（`Shift` 10%）、`Home` / `End` 到两端；
 *   双击画面回到 50%。
 */
interface CompressCompareProps {
  compressedUrl: string;
  /** 源图像素尺寸，用来算图片在容器里真正占的矩形。 */
  width: number;
  height: number;
  /** 文件名，用于 alt。 */
  name: string;
}

/** 图片的显示矩形（相对对比层）。 */
interface Fit {
  left: number;
  top: number;
  width: number;
  height: number;
}

const DEFAULT_POSITION = 50;

export function CompressCompare({
  compressedUrl,
  width,
  height,
  name,
}: CompressCompareProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  /** 分割线位置：0 = 全是压缩后，100 = 全是原图。 */
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setBox((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * 图片在容器里实际占的矩形。
   *
   * 缩放系数上限是 1：原图那张 `<img>` 用的是 `max-w-full max-h-full`，
   * 天生不会把小于容器的图放大；这里跟着不放大，两层的矩形才对得上。
   */
  const fit = useMemo<Fit | null>(() => {
    if (!box.width || !box.height || !width || !height) return null;
    const scale = Math.min(1, box.width / width, box.height / height);
    const displayWidth = width * scale;
    const displayHeight = height * scale;
    return {
      left: (box.width - displayWidth) / 2,
      top: (box.height - displayHeight) / 2,
      width: displayWidth,
      height: displayHeight,
    };
  }, [box, width, height]);

  /** 把鼠标/手指的横坐标换算成 0–100 的位置，超界就夹住。 */
  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const scale = Math.min(1, rect.width / width, rect.height / height);
      const displayWidth = width * scale;
      const left = (rect.width - displayWidth) / 2;
      const percent = ((clientX - rect.left - left) / displayWidth) * 100;
      setPosition(Math.min(100, Math.max(0, percent)));
    },
    [width, height],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // 只接主键（鼠标右键 / 中键不拖），触屏与触控笔没有 button 概念
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      draggingRef.current = true;
      updateFromClientX(event.clientX);
    },
    [updateFromClientX],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      updateFromClientX(event.clientX);
    },
    [updateFromClientX],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        setPosition((current) => Math.max(0, current - step));
        break;
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        setPosition((current) => Math.min(100, current + step));
        break;
      case "Home":
        event.preventDefault();
        setPosition(0);
        break;
      case "End":
        event.preventDefault();
        setPosition(100);
        break;
      default:
        break;
    }
  }, []);

  const resetPosition = useCallback(() => setPosition(DEFAULT_POSITION), []);

  // 分割线相对对比层的横坐标（像素）
  const dividerX = fit ? fit.left + (position / 100) * fit.width : box.width / 2;

  return (
    <div
      ref={rootRef}
      className="absolute inset-4 cursor-ew-resize touch-pan-y select-none [-webkit-touch-callout:none]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onDoubleClick={resetPosition}
      role="group"
      aria-label="原图与压缩后对比：左右拖动分割线"
    >
      {/* 压缩后的右半边：位置与尺寸跟底下那张原图逐像素对齐 */}
      {fit ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 本地 object URL，不走 next/image */}
          <img
            key={compressedUrl}
            src={compressedUrl}
            alt={`${name}（压缩后）`}
            draggable={false}
            className="pointer-events-none absolute object-contain"
            style={{
              left: fit.left,
              top: fit.top,
              width: fit.width,
              height: fit.height,
              clipPath: `inset(0 0 0 ${dividerX - fit.left}px)`,
            }}
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute w-0.5 -translate-x-1/2 bg-white shadow-[0_0_6px_rgba(0,0,0,0.35)]"
            style={{ left: dividerX, top: fit.top, height: fit.height }}
          />

          <div
            role="slider"
            tabIndex={0}
            aria-label="对比原图与压缩后"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(position)}
            aria-valuetext={`${Math.round(position)}%`}
            onKeyDown={handleKeyDown}
            className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-[#E5E5E5] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.25)] outline-none focus-visible:ring-2 focus-visible:ring-[#000000] focus-visible:ring-offset-2"
            style={{
              left: dividerX,
              top: fit.top + fit.height / 2,
            }}
          >
            <ChevronsLeftRight
              aria-hidden="true"
              className="h-3.5 w-3.5 text-[#000000]"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
