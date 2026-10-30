"use client";

import { Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes, percentSaved } from "@/lib/image-compress/format-bytes";
import type { CompressOutcome } from "./image-source";

/**
 * 结果区（《功能/图片压缩》§2.1）：体积对比 + 节省百分比 + 输出尺寸 + 下载。
 *
 * 三种状态：
 * - 还没载入 / 还没点「开始压缩」：虚线占位块说下一步，不显示数字；
 * - **压不动**（优化后没有变小）：只说明原因，**不给下载**——
 *   PNG 走 oxipng 无损优化，已经压到极限的图确实再压不小；JPG 也可能在极高质量时
 *   涨回来。2026-10-30 联调指出「怎么还会有变大的情况」，从此绝不把更大的文件递出去；
 * - 真的变小了：体积对比 + 精确字节数 + 下载。
 *
 * 下载按钮在移动端是**吸底**的那一份（由视图层用 `md:hidden` 渲染），
 * 卡片内这一份 `hidden md:flex`——同一时刻只有一个可见。
 */

interface CompressResultProps {
  /** 原图字节数；`null` = 还没载入图片。 */
  originalSize: number | null;
  /** 压缩结果；`null` = 还没点「开始压缩」（或参数改了，旧结果已作废）。 */
  result: CompressOutcome | null;
  /** 下载文件名；只有真变小了才有。 */
  filename: string;
  /** 是否正在编码（还没出结果时占位块里显示「压缩中…」）。 */
  encoding: boolean;
  /** 在当前结果上继续压缩一次。 */
  onContinue: () => void;
}

export function CompressResult({
  originalSize,
  result,
  filename,
  encoding,
  onContinue,
}: CompressResultProps) {
  const compressed = result?.kind === "compressed" ? result : null;
  const percent =
    originalSize !== null && compressed !== null
      ? percentSaved(originalSize, compressed.size)
      : null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-3.5 w-[3px] bg-[#000000]" />
        <h2 className="text-sm font-semibold text-[#000000]">结果</h2>
      </div>

      {originalSize === null || result === null ? (
        /*
          空态不摆一排破折号：`原图 — → —` 和右侧那个孤零零的大 `—`
          会被读成一根横线（2026-10-30 联调指出「太丑」）。
          换成和拖入区同语言的虚线占位块，只说一句这里会出什么 / 下一步做什么；
          仍然不显示任何数字，语义上还是 §2.3 的「结果区显示 —」。
        */
        <div className="mt-3 flex min-h-[84px] items-center justify-center rounded-[2px] border border-dashed border-[#E5E5E5] px-3 py-4 text-center">
          <p className="text-[11px] leading-relaxed text-[#A0A8B4]">
            {originalSize === null
              ? "载入图片后，这里显示压缩后的体积与下载"
              : encoding
                ? "压缩中…"
                : "点「开始压缩」生成结果"}
          </p>
        </div>
      ) : result.kind === "not-smaller" ? (
        <div className="mt-3">
          <p className="text-xs leading-relaxed text-[#666666]">
            原图 {formatBytes(originalSize)}
            <span className="mx-1.5 text-[#C4C4C4]" aria-hidden="true">
              ·
            </span>
            <span className="tabular-nums">
              {result.plan.width} × {result.plan.height} · {result.plan.label}
            </span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#8A8A8A]">
            重编码后反而变大了（{formatBytes(result.attemptedSize)}）——
            {result.attemptedQuality <= 0.5
              ? "质量已经降到最低还是压不小，直接用原图就行。"
              : "把质量调低一点，或者点「继续压缩」再降一档试试。"}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-xs leading-relaxed text-[#8A8A8A]">
              原图 {formatBytes(originalSize)}
              <span className="mx-1" aria-hidden="true">
                →
              </span>
              <span className="text-sm font-medium tabular-nums text-[#000000]">
                {formatBytes(result.size)}
              </span>
            </p>

            {percent !== null ? (
              // 只有真变小了才走到这里（更大 = 压不动，不显示百分比），所以不会是负数
              <p className="shrink-0 text-xl font-semibold tabular-nums text-[#000000]">
                {percent > 0 ? `-${percent}%` : "0%"}
              </p>
            ) : null}
          </div>

          <p className="mt-1 text-[11px] tabular-nums text-[#8A8A8A]">
            {result.plan.width} × {result.plan.height} · {result.plan.label}
          </p>

          {/*
            精确字节数：MB / KB 是给人看的，带一位小数就必然被舍入；
            `ls -l` 看到的是字节数，验收要「文件字节数与页面显示的数字一致」，
            所以这一行显示不加工的原值（与 `ls -l` 同一串数字，方便直接对照）。
          */}
          <p className="mt-0.5 text-[11px] tabular-nums text-[#999999]">
            {result.size} 字节
          </p>

          {result.effectiveQuality < result.requestedQuality ? (
            <p className="mt-1 text-[11px] leading-relaxed text-[#8A8A8A]">
              质量 {Math.round(result.requestedQuality * 100)}%
              会压得更大，已自动降到 {Math.round(result.effectiveQuality * 100)}%
            </p>
          ) : null}

          <div className="mt-3">
            <CompressDownloadButton
              href={result.url}
              filename={filename}
              className="hidden md:flex"
            />
          </div>

          {/* 在当前结果上继续压一次（把这一版当成新的原图） */}
          <button
            type="button"
            onClick={onContinue}
            disabled={encoding}
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[2px] bg-[#F5F5F5] px-4 py-2 text-sm font-medium text-[#666666] transition-colors hover:bg-[#ECECEC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            继续压缩
          </button>
        </>
      )}
    </div>
  );
}

/** 通栏黑底下载按钮（§7.3 CTA）。移动端吸底那一份也用它，两处样式只此一份。 */
export function CompressDownloadButton({
  href,
  filename,
  className,
}: {
  href: string;
  filename: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      download={filename}
      className={cn(
        "w-full items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333]",
        className,
      )}
    >
      <Download aria-hidden="true" className="h-4 w-4" />
      下载压缩后图片
    </a>
  );
}
