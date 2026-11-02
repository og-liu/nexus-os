"use client";

import { Download, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/format-bytes";
import type { BatchItem } from "./use-batch-extract";

/**
 * 批量模式的文件列表（《功能/音频提取》§2.1 批量，版式对齐图片压缩）。
 *
 * 每行：序号 / 文件名 / 体积 → 输出体积（或状态）/ 右侧下载或状态。
 * 被拒绝的文件也留在列表里并写明原因——比「悄悄少一个」更容易排查。
 */
interface BatchListProps {
  items: BatchItem[];
  onClear: () => void;
  disabled: boolean;
}

/** 一行的副标题：按状态给「体积 → 输出体积」或一句进度/原因。 */
function rowDetail(item: BatchItem): string {
  switch (item.status) {
    case "ready":
      return formatBytes(item.size);
    case "uploading":
      return `${formatBytes(item.size)} · 上传 ${item.progress}%`;
    case "extracting":
      return `${formatBytes(item.size)} · 正在提取…`;
    case "done":
      return `${formatBytes(item.size)} → ${formatBytes(item.outputSize ?? 0)} · ${
        item.mode === "copy" ? "无损提取" : "已转为 AAC"
      }`;
    default:
      return item.message ?? "";
  }
}

export function BatchList({ items, onClear, disabled }: BatchListProps) {
  return (
    <section className="overflow-hidden rounded-[2px] bg-white">
      <div className="flex items-center gap-2 border-b border-[#F0F0F0] px-3 py-2 md:px-4">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-[#000000]">
          批量提取 · {items.length} 个
        </p>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="flex h-7 shrink-0 cursor-pointer items-center rounded-[2px] px-2.5 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000] disabled:cursor-not-allowed disabled:text-[#D9D9D9]"
        >
          清空
        </button>
      </div>

      <ul className="max-h-[calc(100vh-26rem)] divide-y divide-[#F0F0F0] overflow-y-auto">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-3 px-3 py-2.5 md:px-4">
            <span className="w-5 shrink-0 text-[11px] tabular-nums text-[#A0A8B4]">
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[#000000]">{item.name}</p>
              <p
                className={`mt-0.5 truncate text-[11px] tabular-nums ${
                  item.status === "error" ? "text-[#B91C1C]" : "text-[#8A8A8A]"
                }`}
              >
                {rowDetail(item)}
              </p>
            </div>

            <div className="shrink-0">
              {item.status === "done" && item.url ? (
                <a
                  href={item.url}
                  download={item.outputName}
                  className="flex h-7 items-center gap-1 rounded-[2px] bg-[#F5F5F5] px-2 text-[11px] font-medium text-[#000000] transition-colors hover:bg-[#ECECEC]"
                >
                  <Download aria-hidden="true" className="h-3 w-3" />
                  下载
                </a>
              ) : item.status === "uploading" || item.status === "extracting" ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-[#8A8A8A]" />
              ) : (
                <span className="text-[11px] text-[#A0A8B4]">
                  {item.status === "rejected" ? "已跳过" : item.status === "error" ? "失败" : "待提取"}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
