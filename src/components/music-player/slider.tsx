"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 一条能拖的滑块（进度条 / 音量条共用）。
 *
 * **拖动期间不回写外部值**（《功能/音乐播放器》§七第 3 条）：播放位置由
 * `timeupdate` 每秒写四次，拖动时如果还跟着回写，滑块会被播放头一次次拽回去。
 * 所以拖动中显示本地草稿，松手（或键盘 / 失焦）才提交。
 */
interface SliderProps {
  value: number;
  max: number;
  step?: number;
  /** 松手时提交最终值——进度条用它去 seek */
  onCommit: (value: number) => void;
  /** 拖动过程中每一点变化都回调——音量条用它实时生效 */
  onInput?: (value: number) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Slider({
  value,
  max,
  step = 0.1,
  onCommit,
  onInput,
  label,
  disabled = false,
  className,
}: SliderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const inactive = disabled || max <= 0;

  const commit = () => {
    if (draft === null) return;
    onCommit(draft);
    setDraft(null);
  };

  return (
    <input
      type="range"
      min={0}
      max={Math.max(max, 0)}
      step={step}
      value={shown}
      disabled={inactive}
      aria-label={label}
      onChange={(event) => {
        const next = Number(event.target.value);
        setDraft(next);
        onInput?.(next);
      }}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
      className={cn(
        "h-1 w-full cursor-pointer accent-[#000000] disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    />
  );
}
