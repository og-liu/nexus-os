"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rejectionReason, type RejectionCode } from "@/lib/audio-extract/accept";
import type { ExtractErrorCode } from "@/lib/audio-extract/constants";
import { ExtractRequestError, requestExtract } from "./extract-request";
import { failureOf, type Failure } from "./failure-copy";

/**
 * 单文件提取的状态机（《功能/音频提取》§2.3）。
 *
 * 一次提取只有三个阶段：上传（浏览器知道真实百分比）→ 提取（服务器黑盒，
 * 只给已用秒数）→ 结果。三种都塞进同一个 phase，避免「按钮该不该禁用」
 * 这类问题在组件里再判一遍。
 *
 * 多文件走 `use-batch-extract`；两边的请求都从 `extract-request.ts` 发，
 * 错误码与响应头解析只有一份实现。
 */

export type Phase = "idle" | "ready" | "uploading" | "extracting" | "done" | "error";

export interface Outcome {
  /** 已经 createObjectURL 过的下载地址，重置时统一 revoke */
  url: string;
  filename: string;
  mode: "copy" | "transcode";
  sourceCodec: string;
  durationSec: number | null;
  size: number;
}

export function useAudioExtract() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  /** 清空当前文件与结果（「换一个」与失败后重来都走这里）。 */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    revoke();
    setFile(null);
    setOutcome(null);
    setFailure(null);
    setPhase("idle");
    setProgress(0);
    setElapsedSec(0);
  }, [revoke]);

  /** 选中一个文件：准入通过就进「已选中」，不通过返回原因交给页面弹 Toast。 */
  const pick = useCallback(
    (next: File): RejectionCode | null => {
      const reason = rejectionReason(next);
      if (reason) return reason;
      reset();
      setFile(next);
      setPhase("ready");
      return null;
    },
    [reset],
  );

  /** 开始提取。 */
  const start = useCallback(() => {
    if (!file || phase === "uploading" || phase === "extracting") return;

    revoke();
    setOutcome(null);
    setFailure(null);
    setProgress(0);
    setElapsedSec(0);
    setPhase("uploading");

    const controller = new AbortController();
    abortRef.current = controller;

    requestExtract(file, {
      signal: controller.signal,
      onProgress: setProgress,
      onUploaded: () => setPhase("extracting"),
    })
      .then((response) => {
        const url = URL.createObjectURL(response.blob);
        urlRef.current = url;
        setOutcome({
          url,
          filename: response.filename,
          mode: response.mode,
          sourceCodec: response.sourceCodec,
          durationSec: response.durationSec,
          size: response.size,
        });
        setPhase("done");
      })
      .catch((error: unknown) => {
        // 主动取消（换文件 / 卸载）不改状态，reset 会处理
        if (error instanceof DOMException && error.name === "AbortError") return;
        const code: ExtractErrorCode =
          error instanceof ExtractRequestError ? error.code : "extract-failed";
        setFailure(failureOf(code));
        setPhase("error");
      })
      .finally(() => {
        abortRef.current = null;
      });
  }, [file, phase, revoke]);

  // 上传与提取期间每秒走一格，界面显示「已用 N 秒」
  useEffect(() => {
    if (phase !== "uploading" && phase !== "extracting") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // 卸载时收摊：请求掐掉、object URL 放掉
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return {
    file,
    phase,
    progress,
    elapsedSec,
    outcome,
    failure,
    pick,
    start,
    reset,
    busy: phase === "uploading" || phase === "extracting",
  };
}
