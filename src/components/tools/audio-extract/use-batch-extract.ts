"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { batchRejectionReason } from "@/lib/audio-extract/batch-rules";
import type { ExtractErrorCode } from "@/lib/audio-extract/constants";
import { buildZip, uniqueName } from "@/lib/zip";
import { useToast } from "@/components/ui/toast";
import { ExtractRequestError, requestExtract } from "./extract-request";
import { FAILURE_COPY } from "./failure-copy";

/**
 * 批量提取的状态机（《功能/音频提取》§2.1 批量）。
 *
 * - 只有 1 个文件走单文件流程；2 个及以上走这里（和图片压缩一致）；
 * - **串行**提取：每个视频都要完整上传到服务器、服务器只有一个临时文件，
 *   并行只会让几个大文件抢带宽、把 2 核机器压垮；
 * - 准入规则在 `lib/audio-extract/batch-rules.ts`（单文件 500 MB、每批 10 个），
 *   被拒的文件留在列表里写明原因，不影响同批其它个；
 * - 清空 / 换一批 / 卸载时 **abort 正在跑的那一次请求**，循环在下一个检查点退出，
 *   不会把旧结果塞进新列表，也不会漏掉已创建的 object URL。
 */

export type BatchStatus = "ready" | "uploading" | "extracting" | "done" | "rejected" | "error";

export interface BatchItem {
  id: number;
  file: File;
  name: string;
  size: number;
  status: BatchStatus;
  /** 上传百分比（0–100）；提取阶段恒为 100（服务器不给进度） */
  progress: number;
  /** 拒绝 / 失败的原因，一行字 */
  message?: string;
  outputName?: string;
  outputSize?: number;
  mode?: "copy" | "transcode";
  durationSec?: number | null;
  url?: string;
}

export interface BatchProgress {
  total: number;
  done: number;
}

const ZIP_FILENAME = "extracted-audio.zip";

export function useBatchExtract() {
  const toast = useToast();

  const [items, setItems] = useState<BatchItem[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress>({ total: 0, done: 0 });
  const [zipBusy, setZipBusy] = useState(false);

  const nextIdRef = useRef(0);
  const itemsRef = useRef<BatchItem[]>([]);
  const urlsRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  /** 只改某一个 id 的字段，其余原样（并行更新时不会互相覆盖）。 */
  const update = useCallback((id: number, patch: Partial<BatchItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const releaseAllUrls = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
  }, []);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  /** 替换整批文件：旧的 URL 全部释放、正在跑的循环作废。 */
  const addFiles = useCallback(
    (files: File[]) => {
      abortRef.current?.abort();
      abortRef.current = null;
      releaseAllUrls();
      setRunning(false);
      setProgress({ total: 0, done: 0 });

      const next: BatchItem[] = [];
      let acceptedCount = 0;

      for (const file of files) {
        const reason = batchRejectionReason(file, { acceptedCount });
        const base: BatchItem = {
          id: ++nextIdRef.current,
          file,
          name: file.name,
          size: file.size,
          status: "rejected",
          progress: 0,
          message: reason ?? undefined,
        };
        if (reason) {
          next.push(base);
          continue;
        }
        acceptedCount += 1;
        next.push({ ...base, status: "ready" });
      }

      setItems(next);
    },
    [releaseAllUrls],
  );

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    releaseAllUrls();
    setItems([]);
    setRunning(false);
    setProgress({ total: 0, done: 0 });
  }, [releaseAllUrls]);

  /** 串行提取：逐个上传、逐个拿结果。 */
  const start = useCallback(async () => {
    if (running) return;

    const targets = itemsRef.current.filter(
      (item) => item.status === "ready" || item.status === "error",
    );
    if (targets.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setProgress({ total: targets.length, done: 0 });

    let done = 0;
    for (const item of targets) {
      if (controller.signal.aborted) break;

      update(item.id, { status: "uploading", progress: 0, message: undefined });

      try {
        const response = await requestExtract(item.file, {
          signal: controller.signal,
          onProgress: (percent) => update(item.id, { progress: percent }),
          onUploaded: () => update(item.id, { status: "extracting", progress: 100 }),
        });
        const url = URL.createObjectURL(response.blob);
        urlsRef.current.add(url);
        update(item.id, {
          status: "done",
          url,
          outputName: response.filename,
          outputSize: response.size,
          mode: response.mode,
          durationSec: response.durationSec,
        });
      } catch (error) {
        // 取消是用户主动的，不留一句「提取失败了」
        if (error instanceof DOMException && error.name === "AbortError") break;
        const code: ExtractErrorCode =
          error instanceof ExtractRequestError ? error.code : "extract-failed";
        update(item.id, { status: "error", message: FAILURE_COPY[code].title });
      }

      done += 1;
      setProgress({ total: targets.length, done });
    }

    abortRef.current = null;
    setRunning(false);
  }, [running, update]);

  /** 把已完成的全部打成一个 ZIP（store 模式，音频本身已经压过一遍）。 */
  const downloadAll = useCallback(async () => {
    if (zipBusy) return;

    const finished = itemsRef.current.filter(
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
          data: new Uint8Array(await (await fetch(item.url as string)).arrayBuffer()),
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
      toast.error("打包失败了，试试逐个下载");
    } finally {
      setZipBusy(false);
    }
  }, [zipBusy, toast]);

  const pending = items.some((item) => item.status === "ready" || item.status === "error");

  return {
    items,
    running,
    progress,
    zipBusy,
    pending,
    addFiles,
    start,
    clearAll,
    downloadAll,
  };
}
