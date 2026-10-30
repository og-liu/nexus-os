"use client";

import { Download, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/image-compress/format-bytes";
import type { BatchItem } from "./use-batch-compress";

/**
 * 批量模式的文件列表（《功能/图片压缩》§2.1 批量）。
 *
 * 每行：序号 / 文件名 / 原始体积 → 压缩后体积（或状态）/ 右侧下载或状态。
 * 被拒绝的文件也留在列表里并写明原因——比「悄悄少一张」更容易排查。
 */
interface BatchListProps {
  items: BatchItem[];
  onClear: () => void;
}

export function BatchList({ items, onClear }: BatchListProps) {
  return (
    <section className="overflow-hidden rounded-[2px] bg-white">
      <div className="flex items-center gap-2 border-b border-[#F0F0F0] px-3 py-2 md:px-4">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-[#000000]">
          批量压缩 · {items.length} 张
        </p>
        <button
          type="button"
          onClick={onClear}
          className="flex h-7 shrink-0 cursor-pointer items-center rounded-[2px] px-2.5 text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
        >
          清空
        </button>
      </div>

      <ul className="max-h-[calc(100vh-26rem)] divide-y divide-[#F0F0F0] overflow-y-auto">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="flex items-center gap-3 px-3 py-2.5 md:px-4"
          >
            <span className="w-5 shrink-0 text-[11px] tabular-nums text-[#A0A8B4]">
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[#000000]">
                {item.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] tabular-nums text-[#8A8A8A]">
                {formatBytes(item.size)}
                {item.status === "done" && item.compressedSize !== undefined
                  ? ` → ${formatBytes(item.compressedSize)}`
                  : ""}
                {item.effectiveQuality !== undefined &&
                item.requestedQuality !== undefined &&
                item.effectiveQuality < item.requestedQuality
                  ? ` · 质量自动降到 ${Math.round(item.effectiveQuality * 100)}%`
                  : ""}
                {item.message ? ` · ${item.message}` : ""}
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
              ) : item.status === "encoding" ? (
                <Loader2
                  aria-label="压缩中"
                  className="h-4 w-4 animate-spin text-[#000000]"
                />
              ) : (
                <span
                  className={
                    item.status === "rejected" || item.status === "error"
                      ? "text-[11px] text-[#B91C1C]"
                      : "text-[11px] text-[#A0A8B4]"
                  }
                >
                  {item.status === "not-smaller"
                    ? "压不动"
                    : item.status === "error"
                      ? "失败"
                      : item.status === "rejected"
                        ? "已跳过"
                        : "待压缩"}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
