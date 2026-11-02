"use client";

import { useState, type DragEvent, type KeyboardEvent } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 音频提取的空态拖入区（《功能/音频提取》§2.1）。
 *
 * 整块是**一个**按钮：拖拽、点击、Tab + Enter 都落在同一个元素上，
 * 里面不再塞「选择文件」——同一件事两个入口，用户会犹豫。
 *
 * 拖拽必须 `preventDefault()`：`dragover` / `drop` 的默认行为是「浏览器打开这个文件」，
 * 不拦就是整页跳去那个视频。
 *
 * 为什么不和图片压缩的拖入区合并成一个组件：那个版本带「拒绝提示占位」与批量语义，
 * 硬抽公共件要改动已上线页面的交互与测试；两边只是长得像，职责不同。等第三个
 * 拖入区出现、形状确实收敛了再抽。
 */

interface VideoDropzoneProps {
  /** 打开系统文件框（`<input type="file">` 由视图层持有）。 */
  onPick: () => void;
  /** 拖入的文件——只取第一个，多的忽略。 */
  onFile: (file: File) => void;
}

export function VideoDropzone({ onPick, onFile }: VideoDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // dragover 阶段拿不到文件名（安全限制），只能看有没有 Files
    if (event.dataTransfer.types.includes("Files")) setDragging(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="选择视频"
      onClick={onPick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[2px] border border-dashed bg-white p-8 text-center md:min-h-[260px]",
        dragging ? "border-[#000000] bg-[#F5F5F5]" : "border-[#D9D9D9]",
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-[2px] bg-[#F5F5F5]">
        <Upload className="h-5 w-5 text-[#1F1F1F]" />
      </span>
      <p className="text-sm font-medium text-[#000000]">把一个视频拖到这里</p>
      <p className="text-xs text-[#8A8A8A]">或者点击选择文件</p>
      <p className="text-[11px] leading-relaxed text-[#A0A8B4]">
        MP4 / MOV / MKV / AVI / WEBM / TS 等，单个不超过 500 MB
      </p>
    </div>
  );
}
