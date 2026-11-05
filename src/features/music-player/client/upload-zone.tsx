"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, CloudUpload, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/format-bytes";
import {
  AUDIO_EXTENSIONS,
  MAX_TRACK_BYTES,
  USER_QUOTA_BYTES,
} from "@/features/music-player/shared/formats";
import { cn } from "@/lib/utils";
import type { UploadItem } from "./use-upload-queue";

/**
 * 上传区（features/music-player/README.md §2.1）。
 *
 * 桌面是虚线拖入框，手机没有拖拽这回事——所以手机上这块不渲染，改成顶部
 * `ToolMobileBar` 的「添加音乐」按钮直接开文件选择器（§2.3）。
 *
 * **文件选择框不在这里**：它在 `MusicView` 上，因为手机顶部那个按钮也要开同一个选择器。
 * 两个 `<input type="file">` 会带来两套「上次选了哪些文件」的内部状态，而它们本该是同一件事。
 */
interface UploadZoneProps {
  items: UploadItem[];
  busy: boolean;
  usedBytes: number;
  onPick: () => void;
  onFiles: (files: File[]) => void;
  onClear: () => void;
}

export function UploadZone({
  items,
  busy,
  usedBytes,
  onPick,
  onFiles,
  onClear,
}: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const finished = items.filter((item) => item.status === "done" || item.status === "error").length;
  // 用到八成开始提醒：等真满了才变红，用户已经传不进去了
  const nearFull = USER_QUOTA_BYTES > 0 && usedBytes / USER_QUOTA_BYTES >= 0.8;

  return (
    <section aria-label="上传音乐" className="rounded-[2px] bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000000]">
          <span className="h-3.5 w-[3px] bg-[#000000]" />
          添加音乐
        </h2>
        {finished > 0 && !busy ? (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer text-xs text-[#8A8A8A] transition-colors hover:text-[#000000]"
          >
            清空记录
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onPick}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = Array.from(event.dataTransfer.files);
          if (dropped.length > 0) onFiles(dropped);
        }}
        disabled={busy}
        className={cn(
          "mt-4 flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[2px] border border-dashed px-4 py-8 text-center transition-colors",
          dragging
            ? "border-[#000000] bg-[#F5F5F5]"
            : "border-[#D9D9D9] bg-white hover:border-[#A0A8B4]",
          busy && "cursor-not-allowed opacity-60",
        )}
      >
        <CloudUpload className="h-6 w-6 text-[#A0A8B4]" />
        <span className="text-sm text-[#000000]">
          {busy ? "正在上传…" : "把音频拖到这里，或点击选择"}
        </span>
        <span className="text-xs leading-relaxed text-[#A0A8B4]">
          支持 {AUDIO_EXTENSIONS.join(" / ")} · 单个不超过 {formatBytes(MAX_TRACK_BYTES)}
          <br />
          可一次选多个，按选择顺序逐个上传
        </span>
      </button>

      {items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.key} className="rounded-[2px] bg-[#F5F5F5] p-2.5">
              <div className="flex items-center gap-2">
                {item.status === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" />
                ) : item.status === "error" ? (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#B42318]" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#666666]" />
                )}
                <span
                  className="min-w-0 flex-1 truncate text-xs text-[#1F1F1F]"
                  title={item.name}
                >
                  {item.name}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-[#8A8A8A]">
                  {item.status === "error" ? "失败" : formatBytes(item.size)}
                </span>
              </div>

              {item.status === "uploading" ? (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#E5E5E5]">
                  <div
                    className="h-full bg-[#000000] transition-[width] duration-200"
                    style={{ width: `${Math.round(item.progress * 100)}%` }}
                  />
                </div>
              ) : item.status === "error" ? (
                <p className="mt-1 text-[10px] leading-relaxed text-[#B42318]">{item.message}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 border-t border-[#F0F0F0] pt-3">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#8A8A8A]">曲库已用</span>
          <span
            className={cn(
              "tabular-nums",
              nearFull ? "font-medium text-[#B42318]" : "text-[#8A8A8A]",
            )}
          >
            {formatBytes(usedBytes)} / {formatBytes(USER_QUOTA_BYTES)}
          </span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
          <div
            className={cn("h-full transition-[width]", nearFull ? "bg-[#B42318]" : "bg-[#000000]")}
            style={{ width: `${Math.min(100, (usedBytes / USER_QUOTA_BYTES) * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-right text-[10px] tabular-nums text-[#A0A8B4]">
          {nearFull ? "空间快用完了" : `还能传 ${formatBytes(Math.max(0, USER_QUOTA_BYTES - usedBytes))}`}
        </p>
      </div>
    </section>
  );
}
