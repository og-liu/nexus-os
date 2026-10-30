"use client";

import { useState, type DragEvent, type KeyboardEvent } from "react";
import { ImageUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 拖入区（《功能/图片压缩》§2.1 空态）。
 *
 * 整块是**一个**按钮：拖拽、点击、Tab + Enter 三件事都落在同一个元素上，
 * 里面不再塞「选择文件」按钮——同一件事两个入口，用户会犹豫。
 *
 * 拖拽必须 `preventDefault()`：`dragover` / `drop` 的默认行为是「浏览器打开这个文件」，
 * 不拦就是整页跳去那张图（文档 §七 第一条坑）。
 */

/** 被拒绝时的提示（GIF / 解码失败），占的是空态的位置。 */
export interface RejectNotice {
  title: string;
  detail: string;
}

interface CompressDropzoneProps {
  /** 打开系统文件框（由视图层持有 `<input type="file">`）。 */
  onPick: () => void;
  /** 拖入 / 选中的文件（可能一次多个），交给视图层分批。 */
  onFiles: (files: File[]) => void;
  /** 有值时显示拒绝提示（虚线框不变，换掉里面的三行字）。 */
  reject?: RejectNotice | null;
}

export function CompressDropzone({
  onPick,
  onFiles,
  reject = null,
}: CompressDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // dragover 阶段拿不到文件名（安全限制），只能看有没有 Files
    if (event.dataTransfer.types.includes("Files")) setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
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
      aria-label={reject ? "换一张图片" : "选择图片"}
      onClick={onPick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[2px] border border-dashed bg-white p-8 text-center md:min-h-[300px] xl:min-h-[360px]",
        dragging ? "border-[#000000] bg-[#F5F5F5]" : "border-[#D9D9D9]",
      )}
    >
      {reject ? (
        <>
          <p className="text-sm font-medium text-[#000000]">{reject.title}</p>
          <p className="text-xs leading-relaxed text-[#8A8A8A]">{reject.detail}</p>
          <p className="text-[11px] text-[#A0A8B4]">点这里换一张图片</p>
        </>
      ) : (
        <>
          <ImageUp aria-hidden="true" className="h-7 w-7 text-[#C4C4C4]" />
          <p className="text-sm font-medium text-[#000000]">把图片拖到这里</p>
          <p className="text-xs text-[#8A8A8A]">
            或点击选择文件、按 ⌘/Ctrl + V 粘贴
          </p>
          <p className="text-[11px] text-[#A0A8B4]">
            支持 JPG / PNG，单张不超过 20 MB；可一次拖入多张，图片不会上传到服务器
          </p>
        </>
      )}
    </div>
  );
}
