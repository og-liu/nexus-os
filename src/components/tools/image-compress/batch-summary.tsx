"use client";

import { Download, Loader2, RefreshCw } from "lucide-react";
import { formatBytes, percentSaved } from "@/lib/image-compress/format-bytes";
import type { BatchItem, BatchProgress } from "./use-batch-compress";

/**
 * 批量模式的结果区（《功能/图片压缩》§2.1 批量）。
 *
 * 汇总只看「真正压成功」的那些张：合计原始体积 → 合计压缩后体积、总节省百分比；
 * 其余（跳过 / 失败 / 压不动）在列表里逐条说明。底部两个动作：下载全部（ZIP）、继续压缩。
 */
interface BatchSummaryProps {
  items: BatchItem[];
  progress: BatchProgress;
  encoding: boolean;
  zipBusy: boolean;
  onDownloadAll: () => void;
  onContinue: () => void;
}

export function BatchSummary({
  items,
  progress,
  encoding,
  zipBusy,
  onDownloadAll,
  onContinue,
}: BatchSummaryProps) {
  const done = items.filter(
    (item) => item.status === "done" && item.compressedSize !== undefined,
  );
  const totalOriginal = done.reduce((sum, item) => sum + item.size, 0);
  const totalCompressed = done.reduce(
    (sum, item) => sum + (item.compressedSize ?? 0),
    0,
  );
  const percent =
    totalOriginal > 0 ? percentSaved(totalOriginal, totalCompressed) : 0;
  const skipped = items.filter(
    (item) =>
      item.status === "rejected" ||
      item.status === "error" ||
      item.status === "not-smaller",
  ).length;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-3.5 w-[3px] bg-[#000000]" />
        <h2 className="text-sm font-semibold text-[#000000]">结果</h2>
      </div>

      {encoding ? (
        <p
          aria-live="polite"
          className="mt-3 text-xs tabular-nums text-[#8A8A8A]"
        >
          正在压缩第 {Math.min(progress.done + 1, progress.total)} /{" "}
          {progress.total} 张…
        </p>
      ) : null}

      {done.length === 0 ? (
        <div className="mt-3 flex min-h-[84px] items-center justify-center rounded-[2px] border border-dashed border-[#E5E5E5] px-3 py-4 text-center">
          <p className="text-[11px] leading-relaxed text-[#A0A8B4]">
            {encoding ? "压缩中…" : "点「开始压缩」生成结果"}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-xs leading-relaxed text-[#8A8A8A]">
            合计 {formatBytes(totalOriginal)} →{" "}
            <span className="text-sm font-medium tabular-nums text-[#000000]">
              {formatBytes(totalCompressed)}
            </span>
          </p>

          <p className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-[11px] text-[#8A8A8A]">
              {done.length} 张可下载
              {skipped > 0 ? ` · ${skipped} 张跳过或压不动` : ""}
            </span>
            <span className="shrink-0 text-xl font-semibold tabular-nums text-[#000000]">
              {percent > 0 ? `-${percent}%` : "0%"}
            </span>
          </p>

          <div className="mt-3">
            <button
              type="button"
              onClick={onDownloadAll}
              disabled={zipBusy || encoding}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#E5E5E5] disabled:text-[#A0A8B4]"
            >
              {zipBusy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Download aria-hidden="true" className="h-4 w-4" />
              )}
              下载全部（ZIP）
            </button>
          </div>

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
