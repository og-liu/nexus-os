"use client";

import { useEffect, useRef } from "react";
import { ImageUp } from "lucide-react";
import { ToolHeader } from "@/components/tools/tool-header";
import { ToolMobileBar } from "@/components/tools/tool-mobile-bar";
import { findToolBySlug } from "@/components/tools/tool-catalog";
import { useToast } from "@/components/ui/toast";
import { QUALITY_MIN } from "@/lib/image-compress/constants";
import { BatchList } from "./batch-list";
import { BatchSummary } from "./batch-summary";
import { CompressControls } from "./compress-controls";
import { CompressDropzone } from "./compress-dropzone";
import { CompressPreview } from "./compress-preview";
import { CompressDownloadButton, CompressResult } from "./compress-result";
import { useBatchCompress } from "./use-batch-compress";
import { useImageCompress } from "./use-image-compress";

/**
 * 图片压缩工具页（《功能/图片压缩》§2.1）的视图层：版式 + 组件组合。
 *
 * 两种模式：
 * - **单张**（1 个文件）：预览 + 对比滑块 + 结果区，状态机在 `useImageCompress`；
 * - **批量**（2 个及以上）：列表逐张压、逐张下载 + ZIP 全部下载，状态机在
 *   `useBatchCompress`。两边共用同一个质量滑杆值（批量压缩时把单张的「结果」清掉）。
 *
 * 三档响应式照文档 §2.2：`< md` 单列（下载吸底）、`md` 参数两列、`≥ lg` 两栏。
 */
export function CompressView() {
  const tool = findToolBySlug("image-compress");
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const single = useImageCompress(inputRef);
  const batch = useBatchCompress();

  const isBatch = batch.items.length > 1;
  const compressed = single.outcome?.kind === "compressed" ? single.outcome : null;

  /** 一个入口收所有文件：1 张进单张流程，多张进批量流程。 */
  const handleFiles = (files: File[]) => {
    if (files.length <= 1) {
      batch.clearAll();
      if (files[0]) void single.loadFile(files[0]);
      return;
    }
    single.clearImage();
    batch.addFiles(files);
  };

  // 粘贴等旁路入口也可能把单张图片载进来：这时把批量列表让出去
  const batchCount = batch.items.length;
  const clearBatch = batch.clearAll;
  useEffect(() => {
    if (single.source && batchCount > 0) clearBatch();
  }, [single.source, batchCount, clearBatch]);

  /** 改质量：单张作废旧结果；批量则把整批结果标记为待压缩（参数变了，旧数字不再可信）。 */
  const handleQualityChange = (next: number) => {
    single.changeQuality(next);
    if (isBatch) batch.resetResults();
  };

  /** 批量「继续压缩」：质量降一档，整批重压。 */
  const handleBatchContinue = () => {
    if (single.quality <= QUALITY_MIN + 0.001) {
      toast.info("已经到最低质量了，压不动了");
      return;
    }
    const next = Math.max(
      QUALITY_MIN,
      Math.round((single.quality - 0.1) * 100) / 100,
    );
    single.changeQuality(next);
    void batch.compressAll(next);
  };

  const hasUsableBatch = batch.items.some((item) => item.mime !== null);

  return (
    <>
      <ToolMobileBar
        newLabel="选择图片"
        onNew={single.openPicker}
        icon={ImageUp}
      />

      <div className="px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto w-full max-w-[1360px] space-y-4 xl:space-y-6">
          {tool ? <ToolHeader tool={tool} /> : null}

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              // 清空 value：不然再选同一批文件不会触发 change
              event.target.value = "";
              if (files.length > 0) handleFiles(files);
            }}
          />

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            {isBatch ? (
              <BatchList items={batch.items} onClear={batch.clearAll} />
            ) : single.source ? (
              <CompressPreview
                name={single.source.name}
                size={single.source.size}
                width={single.source.width}
                height={single.source.height}
                originalUrl={single.source.originalUrl}
                compressedUrl={compressed?.url ?? null}
                compressedSize={compressed?.size ?? null}
                encoding={single.encoding}
                encodingStartedAt={single.encodingStartedAt}
                onReplace={single.clearImage}
              />
            ) : (
              <CompressDropzone
                onPick={single.openPicker}
                onFiles={handleFiles}
                reject={single.reject}
              />
            )}

            {/*
              参数面板：< md 单列；md 起横排 2 列（质量 / 结果）；
              ≥ lg 回到单列（这时它是 300–340px 的右栏，横排会挤成一团）。
            */}
            <div className="rounded-[2px] bg-white p-5">
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-1 lg:gap-4">
                <div className="md:col-span-2 lg:col-span-1">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-3.5 w-[3px] bg-[#000000]" />
                    <h2 className="text-sm font-semibold text-[#000000]">
                      压缩参数
                    </h2>
                  </div>
                </div>

                <CompressControls
                  quality={single.quality}
                  onQualityChange={handleQualityChange}
                  onStart={() =>
                    void (isBatch
                      ? batch.compressAll(single.quality)
                      : single.startCompress())
                  }
                  canStart={isBatch ? hasUsableBatch : single.source !== null}
                  encoding={isBatch ? batch.encoding : single.encoding}
                />

                {isBatch ? (
                  <BatchSummary
                    items={batch.items}
                    progress={batch.progress}
                    encoding={batch.encoding}
                    zipBusy={batch.zipBusy}
                    onDownloadAll={() => void batch.downloadAll()}
                    onContinue={handleBatchContinue}
                  />
                ) : (
                  <CompressResult
                    originalSize={single.source?.size ?? null}
                    result={single.outcome}
                    filename={single.filename}
                    encoding={single.encoding}
                    onContinue={() => void single.continueCompress()}
                  />
                )}
              </div>
            </div>
          </div>

          {/*
            移动端下载吸底（< md）：只在单张模式用——单张的结果卡在参数面板里，
            手机上可能落到折叠下方。批量模式下「下载全部」就在结果区里、
            和列表同屏，再吸一条底是重复入口（2026-10-30 联调指出），所以不做。
          */}
          {!isBatch && compressed ? (
            <div className="sticky bottom-0 z-10 -mx-4 bg-white px-4 pb-4 pt-2 md:hidden">
              <CompressDownloadButton
                href={compressed.url}
                filename={single.filename}
                className="flex"
              />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
