"use client";

import { useRef } from "react";
import { FileVideo, Loader2, CheckCircle2 } from "lucide-react";
import { formatBytes } from "@/lib/format-bytes";
import { ToolHeader } from "@/components/tools/tool-header";
import { ToolMobileBar } from "@/components/tools/tool-mobile-bar";
import { findToolBySlug } from "@/components/tools/tool-catalog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ExtractResult } from "./extract-result";
import { VideoDropzone } from "./video-dropzone";
import { useAudioExtract } from "./use-audio-extract";

/**
 * 音频提取工具页的视图层（《功能/音频提取》§2）。
 *
 * 版式只有一件事要记：**左主区 = 进视频与开提取，右栏 = 结果**。
 * 宽屏（lg 起）两栏并排，平板（md）并排两列，手机单列纵向——
 * 三档是三个版式，不是同一个版式压窄（§2.2）。
 */
export function ExtractView() {
  const tool = findToolBySlug("audio-extract");
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const extract = useAudioExtract();

  /** 选中 / 拖入一个文件：不合法只弹一句 Toast，不进文件卡。 */
  const handleFile = (file: File) => {
    const reason = extract.pick(file);
    if (reason === "too-large") toast.info("超过 500 MB");
    if (reason === "not-video") toast.info("只支持视频文件");
  };

  const { file, phase, progress, elapsedSec, busy } = extract;

  return (
    <>
      <ToolMobileBar
        newLabel="选择视频"
        onNew={() => inputRef.current?.click()}
        icon={FileVideo}
        disabled={busy}
      />

      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto w-full max-w-[1360px] space-y-4 xl:space-y-6">
          {tool ? <ToolHeader tool={tool} /> : null}

          <input
            ref={inputRef}
            type="file"
            accept="video/*,.mp4,.m4v,.mov,.mkv,.avi,.webm,.ts,.m2ts,.flv,.wmv,.3gp,.mpg,.mpeg,.ogv"
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files?.[0];
              // 清空 value：不然再选同一个文件不会触发 change
              event.target.value = "";
              if (picked) handleFile(picked);
            }}
          />

          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            {/* 主区：空态拖入区，或「文件卡 + 提取」。空态时占满整行（§2.2 平板档） */}
            <div className={cn("space-y-4", !file && "md:col-span-2 lg:col-span-1")}>
              {file ? (
                <section aria-label="已选视频" className="rounded-[2px] bg-white p-5 md:p-6">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] bg-[#F5F5F5]">
                      <FileVideo className="h-4 w-4 text-[#1F1F1F]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#000000]" title={file.name}>
                        {file.name}
                      </p>
                      <p className="mt-1 text-xs text-[#8A8A8A]">{formatBytes(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={extract.reset}
                      disabled={busy}
                      className="shrink-0 cursor-pointer text-xs font-medium text-[#000000] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-[#A0A8B4]"
                    >
                      换一个
                    </button>
                  </div>

                  {busy ? (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-[#000000]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {phase === "uploading"
                            ? `正在上传 ${progress}%`
                            : "正在提取音频…"}
                        </span>
                        <span className="text-[#A0A8B4]">{elapsedSec} 秒</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E5E5E5]">
                        <div
                          className={cn(
                            "h-full bg-[#000000]",
                            // 上传是真实百分比；提取阶段服务器不给进度，走一条匀速流光的「进行中」
                            phase === "uploading" ? "transition-[width] duration-200" : "w-full animate-pulse",
                          )}
                          style={phase === "uploading" ? { width: `${progress}%` } : undefined}
                        />
                      </div>
                    </div>
                  ) : phase === "ready" ? (
                    <button
                      type="button"
                      onClick={extract.start}
                      className="mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[2px] bg-[#000000] px-4 text-sm font-medium text-white transition-colors hover:bg-[#333333] md:h-10"
                    >
                      提取音频
                    </button>
                  ) : phase === "done" ? (
                    // 完成后主区不要空着：给一句收束（下载按钮在结果卡里）
                    <p className="mt-4 flex items-center gap-1.5 text-xs text-[#666666]">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E]" />
                      已经提取好了，下载在结果卡里
                    </p>
                  ) : null}
                </section>
              ) : (
                <VideoDropzone
                  onPick={() => inputRef.current?.click()}
                  onFile={handleFile}
                />
              )}
            </div>

            {/* 右栏：结果 + 「为什么能无损」的说明。空态在平板上让位给整行拖入区 */}
            <div className={cn("space-y-4", !file && "hidden lg:block")}>
              <ExtractResult
                outcome={extract.outcome}
                failure={extract.failure}
                onRetry={extract.reset}
              />

              <section className="hidden rounded-[2px] bg-white p-5 md:block">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000000]">
                  <span className="h-3.5 w-[3px] bg-[#000000]" />
                  能无损就无损
                </h2>
                <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[#666666]">
                  <li>视频里的声音本来就是压缩过的（MV 多是 AAC），再转一次只会更差。</li>
                  <li>所以这里只把音轨换个壳、一次都不解码——无损、几秒完成、体积不变。</li>
                  <li>只有 Opus、AC3 这类播放器不认的编码，才转一次 AAC。</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
