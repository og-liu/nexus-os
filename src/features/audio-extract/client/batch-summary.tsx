"use client";

import { Download, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/format-bytes";
import type { BatchItem, BatchProgress } from "./use-batch-extract";

/**
 * 批量模式的结果区（features/audio-extract/README.md §2.1 批量，版式对齐图片压缩）。
 *
 * 汇总只看「真正提取成功」的那些：合计原始体积 → 合计输出体积、共几个可下载；
 * 其余（跳过 / 失败）在列表里逐条说明。底部一个动作：下载全部（ZIP）。
 *
 * 为什么没有图片压缩的「继续压缩」：那个按钮是「质量降一档重压」，
 * 而音频提取没有可调参数——同一次提取再来一遍结果是一样的。
 */
interface BatchSummaryProps {
  items: BatchItem[];
  progress: BatchProgress;
  running: boolean;
  zipBusy: boolean;
  onDownloadAll: () => void;
}

export function BatchSummary({
  items,
  progress,
  running,
  zipBusy,
  onDownloadAll,
}: BatchSummaryProps) {
  const done = items.filter((item) => item.status === "done");
  const totalOriginal = done.reduce((sum, item) => sum + item.size, 0);
  const totalOutput = done.reduce((sum, item) => sum + (item.outputSize ?? 0), 0);
  const failed = items.filter(
    (item) => item.status === "rejected" || item.status === "error",
  ).length;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-3.5 w-[3px] bg-[#000000]" />
        <h2 className="text-sm font-semibold text-[#000000]">结果</h2>
      </div>

      {running ? (
        <p aria-live="polite" className="mt-3 text-xs tabular-nums text-[#8A8A8A]">
          正在提取第 {Math.min(progress.done + 1, progress.total)} / {progress.total} 个…
        </p>
      ) : null}

      {done.length === 0 ? (
        <div className="mt-3 flex min-h-[84px] items-center justify-center rounded-[2px] border border-dashed border-[#E5E5E5] px-3 py-4 text-center">
          <p className="text-[11px] leading-relaxed text-[#A0A8B4]">
            {running ? "提取中…" : "点「开始提取」生成结果"}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-xs leading-relaxed text-[#8A8A8A]">
            合计 {formatBytes(totalOriginal)} →{" "}
            <span className="text-sm font-medium tabular-nums text-[#000000]">
              {formatBytes(totalOutput)}
            </span>
          </p>

          <p className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-[11px] text-[#8A8A8A]">
              {done.length} 个可下载
              {failed > 0 ? ` · ${failed} 个跳过或失败` : ""}
            </span>
          </p>

          <div className="mt-3">
            <button
              type="button"
              onClick={onDownloadAll}
              disabled={zipBusy || running}
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
        </>
      )}
    </div>
  );
}
