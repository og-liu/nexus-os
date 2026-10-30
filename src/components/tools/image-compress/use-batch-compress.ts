"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { batchRejectionReason } from "@/lib/image-compress/batch-rules";
import { outputFilename, sourceMime } from "@/lib/image-compress/plan-output";
import { buildZip, uniqueName } from "@/lib/image-compress/zip";
import { compressImage } from "./compress-encode";

/**
 * 批量压缩的状态机（《功能/图片压缩》§2.1 批量）。
 *
 * - 只有 1 个文件走单张流程；2 张及以上走这里；
 * - **串行**压缩：WASM 编码 CPU 密集，并行只会互相拖慢、顶高内存；
 * - 准入规则在 `lib/image-compress/batch-rules.ts`（单张 20 MB、每批 30 张 / 200 MB），
 *   被拒的文件留在列表里写明原因，不影响同批其它张；
 * - **每次列表变化都递增 runId**：清空 / 换一批 / 改参数时，正在跑的循环会在
 *   下一个检查点退出——不会把旧质量的结果塞进新列表，也不会漏掉已创建的 object URL。
 */

export type BatchStatus =
  | "ready"
  | "encoding"
  | "done"
  | "not-smaller"
  | "rejected"
  | "error";

export interface BatchItem {
  id: number;
  file: File;
  name: string;
  size: number;
  /** 归一化后的类型；被拒绝时为 `null`。 */
  mime: "image/jpeg" | "image/png" | null;
  status: BatchStatus;
  /** 拒绝 / 失败 / 压不动的原因。 */
  message?: string;
  compressedSize?: number;
  url?: string;
  outputName?: string;
  requestedQuality?: number;
  effectiveQuality?: number;
}

export interface BatchProgress {
  total: number;
  done: number;
}

const ZIP_FILENAME = "compressed-images.zip";

export function useBatchCompress() {
  const toast = useToast();

  const [items, setItems] = useState<BatchItem[]>([]);
  const [encoding, setEncoding] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({ total: 0, done: 0 });
  const [zipBusy, setZipBusy] = useState(false);

  const nextIdRef = useRef(0);
  const urlsRef = useRef<Set<string>>(new Set());
  const itemsRef = useRef<BatchItem[]>([]);
  /** 列表 / 参数每变一次就 +1；在跑的压缩循环据此判断自己是否过期。 */
  const runIdRef = useRef(0);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  /** 释放一个结果 URL（登记表里同步删掉，避免重复 revoke）。 */
  const releaseUrl = useCallback((url?: string) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    urlsRef.current.delete(url);
  }, []);

  /** 页面卸载时把还活着的 URL 全释放掉。 */
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  /** 取消正在跑的循环（清空 / 换批 / 改参数时调用）。 */
  const cancelRun = useCallback(() => {
    runIdRef.current += 1;
    setEncoding(false);
    setProgress({ total: 0, done: 0 });
  }, []);

  /** 替换整批文件：旧的 URL 全部释放、旧循环作废。 */
  const addFiles = useCallback(
    (files: File[]) => {
      cancelRun();
      const next: BatchItem[] = [];
      let acceptedCount = 0;
      let acceptedBytes = 0;

      for (const file of files) {
        const reason = batchRejectionReason(file, {
          acceptedCount,
          acceptedBytes,
        });
        const base: BatchItem = {
          id: ++nextIdRef.current,
          file,
          name: file.name,
          size: file.size,
          mime: null,
          status: "rejected",
          message: reason ?? undefined,
        };

        if (reason) {
          next.push(base);
          continue;
        }

        acceptedCount += 1;
        acceptedBytes += file.size;
        next.push({
          ...base,
          mime: sourceMime(file.name, file.type),
          status: "ready",
        });
      }

      setItems((current) => {
        current.forEach((item) => releaseUrl(item.url));
        return next;
      });
      setProgress({ total: next.filter((item) => item.mime !== null).length, done: 0 });
    },
    [cancelRun, releaseUrl],
  );

  /** 清空整批。 */
  const clearAll = useCallback(() => {
    cancelRun();
    setItems((current) => {
      current.forEach((item) => releaseUrl(item.url));
      return [];
    });
  }, [cancelRun, releaseUrl]);

  /** 改参数后旧结果作废：保留文件与拒绝原因，状态回到 ready。 */
  const resetResults = useCallback(() => {
    cancelRun();
    setItems((current) =>
      current.map((item) => {
        if (item.status === "rejected") return item;
        releaseUrl(item.url);
        return {
          ...item,
          status: "ready",
          url: undefined,
          compressedSize: undefined,
          outputName: undefined,
          message: undefined,
          requestedQuality: undefined,
          effectiveQuality: undefined,
        };
      }),
    );
  }, [cancelRun, releaseUrl]);

  /** 逐张压缩（串行）；质量由视图传入，和单张共用同一个滑杆值。 */
  const compressAll = useCallback(
    async (quality: number) => {
      if (encoding) return;

      const targets = itemsRef.current.filter((item) => item.status !== "rejected");
      if (targets.length === 0) {
        toast.warn("这一批里没有可压缩的图片");
        return;
      }

      const runId = ++runIdRef.current;
      setEncoding(true);
      setProgress({ total: targets.length, done: 0 });
      let done = 0;

      try {
        for (const target of targets) {
          if (runId !== runIdRef.current) return;
          if (!target.mime) continue;

          setItems((current) =>
            current.map((item) =>
              item.id === target.id ? { ...item, status: "encoding" } : item,
            ),
          );

          const { blob, effectiveQuality } = await compressImage(
            target.file,
            target.mime,
            quality,
          );
          // 等编码的这段时间里可能被清空 / 换批 / 改质量：这一份结果直接丢弃
          if (runId !== runIdRef.current) return;
          if (!itemsRef.current.some((item) => item.id === target.id)) return;

          const url = blob.size >= target.size ? undefined : URL.createObjectURL(blob);
          if (url) urlsRef.current.add(url);

          setItems((current) =>
            current.map((item) => {
              if (item.id !== target.id) return item;
              releaseUrl(item.url);
              if (!url) {
                return {
                  ...item,
                  status: "not-smaller",
                  url: undefined,
                  compressedSize: undefined,
                  message: "已经压到极限了",
                  requestedQuality: quality,
                  effectiveQuality,
                };
              }
              return {
                ...item,
                status: "done",
                url,
                compressedSize: blob.size,
                outputName: outputFilename(
                  item.name,
                  target.mime === "image/png" ? "png" : "jpg",
                ),
                message: undefined,
                requestedQuality: quality,
                effectiveQuality,
              };
            }),
          );

          done += 1;
          setProgress({ total: targets.length, done });
        }
      } catch {
        toast.error("压缩失败，请重试");
      } finally {
        if (runId === runIdRef.current) setEncoding(false);
      }
    },
    [encoding, releaseUrl, toast],
  );

  /** 全部下载：把已完成的结果打成 ZIP（store 模式，不再压缩）。 */
  const downloadAll = useCallback(async () => {
    if (zipBusy) return;

    const finished = items.filter(
      (item) => item.status === "done" && item.url && item.outputName,
    );
    if (finished.length === 0) {
      toast.warn("还没有可以下载的结果");
      return;
    }

    setZipBusy(true);
    try {
      const used = new Set<string>();
      const entries = await Promise.all(
        finished.map(async (item) => ({
          name: uniqueName(item.outputName as string, used),
          data: new Uint8Array(
            await (await fetch(item.url as string)).arrayBuffer(),
          ),
        })),
      );

      const zip = buildZip(entries);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(zip)], { type: "application/zip" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = ZIP_FILENAME;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // 给下载留出读取 blob 的时间再回收
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error("打包失败，请逐张下载");
    } finally {
      setZipBusy(false);
    }
  }, [items, toast, zipBusy]);

  return {
    items,
    encoding,
    progress,
    zipBusy,
    addFiles,
    clearAll,
    resetResults,
    compressAll,
    downloadAll,
  };
}
