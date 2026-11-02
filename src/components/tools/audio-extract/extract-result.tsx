"use client";

import { Download, FileAudio } from "lucide-react";
import { formatBytes } from "@/lib/format-bytes";
import type { Failure } from "./failure-copy";
import type { Outcome } from "./use-audio-extract";

/**
 * 右栏的结果块（《功能/音频提取》§2.3）。
 *
 * 三种状态共用一个位置——空、成功、失败。换位置会让用户每次都要重新找，
 * 而这里本来就只有一件事：结果出来了没有。
 *
 * 只画内容、不自带白卡：它和「开始提取」按钮住在**同一张**右栏面板里，
 * 与图片压缩的「参数 + 结果」是同一个结构。
 */

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

interface ExtractResultProps {
  outcome: Outcome | null;
  failure: Failure | null;
  onRetry: () => void;
}

export function ExtractResult({ outcome, failure, onRetry }: ExtractResultProps) {
  if (failure) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3.5 w-[3px] bg-[#000000]" />
          <h2 className="text-sm font-semibold text-[#000000]">结果</h2>
        </div>
        <div className="mt-3 rounded-[2px] border border-dashed border-[#D9D9D9] bg-white px-4 py-8 text-center">
          <p className="text-sm font-medium text-[#000000]">{failure.title}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-[#8A8A8A]">{failure.detail}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 cursor-pointer text-xs font-medium text-[#000000] underline-offset-2 hover:underline"
          >
            换一个视频
          </button>
        </div>
      </div>
    );
  }

  if (outcome) {
    return (
      <div aria-label="提取结果">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3.5 w-[3px] bg-[#000000]" />
          <h2 className="text-sm font-semibold text-[#000000]">结果</h2>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-[2px] bg-[#F5F5F5] p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] bg-white">
            <FileAudio className="h-4 w-4 text-[#1F1F1F]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-[#000000]">{outcome.filename}</p>
            <p className="mt-0.5 text-[11px] text-[#8A8A8A]">
              {formatDuration(outcome.durationSec)} · {formatBytes(outcome.size)}
            </p>
          </div>
        </div>

        <dl className="mt-3 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-[#8A8A8A]">源音轨</dt>
            <dd className="font-medium text-[#000000]">{outcome.sourceCodec.toUpperCase()}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-[#8A8A8A]">处理方式</dt>
            <dd className="font-medium text-[#000000]">
              {outcome.mode === "copy" ? "无损提取" : "已转为 AAC"}
            </dd>
          </div>
        </dl>

        <a
          href={outcome.url}
          download={outcome.filename}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#333333]"
        >
          <Download className="h-4 w-4" />
          下载音频
        </a>
      </div>
    );
  }

  return (
    <div aria-label="提取结果">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="h-3.5 w-[3px] bg-[#000000]" />
        <h2 className="text-sm font-semibold text-[#000000]">结果</h2>
      </div>
      <div className="mt-3 rounded-[2px] border border-dashed border-[#D9D9D9] px-4 py-10 text-center">
        <p className="text-xs leading-relaxed text-[#A0A8B4]">
          提取完成后
          <br />
          这里出现下载按钮
        </p>
      </div>
    </div>
  );
}
