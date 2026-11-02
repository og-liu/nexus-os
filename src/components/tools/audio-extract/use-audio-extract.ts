"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rejectionReason, type RejectionCode } from "@/lib/audio-extract/accept";
import type { ExtractErrorCode } from "@/lib/audio-extract/constants";

/**
 * 「音频提取」的状态机（《功能/音频提取》§2.3）。
 *
 * 一次提取只有三个阶段：上传（浏览器知道真实百分比）→ 提取（服务器黑盒，
 * 只给已用秒数）→ 结果。三种都塞进同一个 phase，避免「按钮该不该禁用」
 * 这类问题在组件里再判一遍。
 *
 * 为什么用 XHR 而不是 fetch：**fetch 没有上传进度**。这个功能要传几十到
 * 几百 MB，没进度条用户只会以为卡死了。XHR 的 `upload.onprogress` 是唯一
 * 标准且到处都有的办法。
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

export interface Failure {
  code: ExtractErrorCode;
  title: string;
  detail: string;
}

/** 失败文案：一句主句 + 一句该干什么（《功能/音频提取》§2.3）。 */
const FAILURE_COPY: Record<ExtractErrorCode, { title: string; detail: string }> = {
  "too-large": { title: "文件超过 500 MB", detail: "先裁剪一下，或者换一个短一点的视频。" },
  "not-video": { title: "只支持视频文件", detail: "MP4 / MOV / MKV / AVI / WEBM / TS 等。" },
  "no-audio": { title: "这个视频没有声音", detail: "文件里没有音轨，换一个试试。" },
  unreadable: {
    title: "这个视频打不开",
    detail: "文件可能损坏，或者编码 ffmpeg 认不出来。",
  },
  unauthorized: { title: "登录状态过期了", detail: "刷新页面重新登录一次。" },
  "extract-failed": { title: "提取失败了", detail: "换一个视频试试；一直失败就说一声。" },
};

function failureOf(code: ExtractErrorCode): Failure {
  return { code, ...FAILURE_COPY[code] };
}

/** 从 `Content-Disposition` 里取出文件名：优先 `filename*=UTF-8''…`，退回 `filename="…"`。 */
export function filenameFromHeader(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // 落回下面的普通字段
    }
  }
  const plain = header.match(/filename="([^"]*)"/i);
  return plain ? plain[1] : fallback;
}

export function useAudioExtract() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const urlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  /** 清空当前文件与结果（「换一个」与失败后重来都走这里）。 */
  const reset = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
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

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/tools/audio-extract");
    xhr.responseType = "blob";
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    // 文件名走自定义头：body 是原始字节，不走 multipart，服务端不用解析表单
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    // 上传完 ≠ 提取完：字节到齐之后才开始等服务器
    xhr.upload.onload = () => setPhase("extracting");

    xhr.onload = () => {
      if (xhr.status === 200) {
        const blob = xhr.response as Blob;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const mode = xhr.getResponseHeader("X-Audio-Mode") === "transcode" ? "transcode" : "copy";
        const duration = Number(xhr.getResponseHeader("X-Audio-Duration") ?? "");
        setOutcome({
          url,
          filename: filenameFromHeader(
            xhr.getResponseHeader("Content-Disposition"),
            `audio${mode === "copy" ? "" : ""}.m4a`,
          ),
          mode,
          sourceCodec: xhr.getResponseHeader("X-Audio-Source") ?? "",
          durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
          size: blob.size,
        });
        setPhase("done");
        return;
      }

      // 错误响应也是 blob（responseType 定的），读回文本来解析 JSON
      void (xhr.response as Blob | null)
        ?.text()
        .then((text) => {
          const parsed = JSON.parse(text) as { code?: ExtractErrorCode; error?: string };
          const code = parsed.code ?? "extract-failed";
          setFailure(failureOf(code));
        })
        .catch(() => setFailure(failureOf("extract-failed")))
        .finally(() => setPhase("error"));
    };

    xhr.onerror = () => {
      setFailure(failureOf("extract-failed"));
      setPhase("error");
    };
    xhr.onabort = () => {
      // 主动取消（换文件 / 卸载）不改状态，reset 会处理
    };

    xhr.send(file);
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
      xhrRef.current?.abort();
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
