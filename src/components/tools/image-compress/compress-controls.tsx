"use client";

import { Loader2 } from "lucide-react";
import {
  QUALITY_MAX,
  QUALITY_MIN,
  QUALITY_STEP,
} from "@/lib/image-compress/constants";

/**
 * 参数面板（《功能/图片压缩》§2.1）：质量滑杆。
 *
 * 压缩由**「开始压缩」按钮**触发（2026-10-30 联调）：载入图片、拖质量都只改参数，
 * 不会自动编码。所以这里除了滑杆，还有那颗通栏黑底的按钮——它是页面上唯一的
 * 主动作，结果区与下载按钮都要等它跑完才出现。
 *
 * 「最大边长」已在 2026-10-30 联调中**整个移除**：只做原尺寸压缩，
 * 不再有缩放档位，也没有「只缩不放」的说明。
 *
 * 质量滑杆对两种格式都有效：JPG 是重编码质量，PNG 是**调色板颜色数**
 * （0.95 ≈ 256 色、0.5 ≈ 16 色）——PNG 靠调色板量化才压得动。
 */
interface CompressControlsProps {
  quality: number;
  onQualityChange: (quality: number) => void;
  onStart: () => void;
  /** 有没有图片可压（没载入时按钮置灰）。 */
  canStart: boolean;
  /** 正在编码（按钮换「压缩中…」并禁用，避免连点排队）。 */
  encoding: boolean;
}

export function CompressControls({
  quality,
  onQualityChange,
  onStart,
  canStart,
  encoding,
}: CompressControlsProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor="image-compress-quality"
          className="text-xs font-medium text-[#000000]"
        >
          质量
        </label>
        <span className="text-[13px] font-medium tabular-nums text-[#000000]">
          {Math.round(quality * 100)}%
        </span>
      </div>

      {/* 触控区加高（h-6 的点击带）：手机上 16px 高的原生滑杆太难点中 */}
      <input
        id="image-compress-quality"
        type="range"
        min={QUALITY_MIN}
        max={QUALITY_MAX}
        step={QUALITY_STEP}
        value={quality}
        onChange={(event) => onQualityChange(Number(event.target.value))}
        className="mt-1.5 h-6 w-full cursor-pointer accent-[#000000]"
      />

      <p className="text-[11px] leading-relaxed text-[#8A8A8A]">
        越低体积越小，画质损失越明显（PNG 会做调色板量化，颜色变少）
      </p>

      {/* 页面唯一的主操作（§7.3 CTA）：不点它就不会编码 */}
      <button
        type="button"
        onClick={onStart}
        disabled={!canStart || encoding}
        className="mt-4 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[2px] bg-[#000000] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#E5E5E5] disabled:text-[#A0A8B4] disabled:hover:bg-[#E5E5E5]"
      >
        {encoding ? (
          <>
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            压缩中…
          </>
        ) : (
          "开始压缩"
        )}
      </button>
    </div>
  );
}
