"use client";

import type { ExtractErrorCode } from "@/features/audio-extract/shared/constants";

/**
 * 一次音频提取请求（单文件与批量共用）。
 *
 * 为什么是 XHR 而不是 fetch：**fetch 没有上传进度**。要传几十到几百 MB 的视频，
 * 没有进度条用户只会以为卡死了；`xhr.upload.onprogress` 是唯一到处都有的办法。
 *
 * 为什么抽出来：单文件与批量是两套状态机（一个只有一次，一个要串行跑一列），
 * 但「发一次请求、解析响应头和错误」是同一件事——各写一份，错误码映射迟早漂。
 */

export interface ExtractResponse {
  blob: Blob;
  filename: string;
  mode: "copy" | "transcode";
  sourceCodec: string;
  durationSec: number | null;
  size: number;
}

export class ExtractRequestError extends Error {
  constructor(readonly code: ExtractErrorCode) {
    super(code);
    this.name = "ExtractRequestError";
  }
}

/** 从 `Content-Disposition` 里取文件名：优先 `filename*=UTF-8''…`，退回 `filename="…"`。 */
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

export interface RequestExtractOptions {
  /** 上传进度（0–100），只在浏览器知道总大小时回调。 */
  onProgress?: (percent: number) => void;
  /** 字节到齐、开始等服务器。 */
  onUploaded?: () => void;
  /** 取消（换一批 / 清空 / 卸载）：中止请求并抛 `AbortError`。 */
  signal?: AbortSignal;
}

/** 发一次提取请求；非 200 一律抛 `ExtractRequestError`（带错误码）。 */
export function requestExtract(
  file: File,
  { onProgress, onUploaded, signal }: RequestExtractOptions = {},
): Promise<ExtractResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/tools/audio-extract");
    xhr.responseType = "blob";
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    // 文件名走自定义头：body 是原始字节，不走 multipart，服务端不用解析表单
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    // 上传完 ≠ 提取完：字节到齐之后才开始等服务器
    xhr.upload.onload = () => onUploaded?.();

    xhr.onload = () => {
      if (xhr.status === 200) {
        const blob = xhr.response as Blob;
        const mode = xhr.getResponseHeader("X-Audio-Mode") === "transcode" ? "transcode" : "copy";
        const duration = Number(xhr.getResponseHeader("X-Audio-Duration") ?? "");
        resolve({
          blob,
          filename: filenameFromHeader(xhr.getResponseHeader("Content-Disposition"), "audio.m4a"),
          mode,
          sourceCodec: xhr.getResponseHeader("X-Audio-Source") ?? "",
          durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
          size: blob.size,
        });
        return;
      }
      // 错误响应也是 blob（responseType 定的），读回文本来解析 JSON
      void (xhr.response as Blob | null)
        ?.text()
        .then((text) => {
          const parsed = JSON.parse(text) as { code?: ExtractErrorCode };
          reject(new ExtractRequestError(parsed.code ?? "extract-failed"));
        })
        .catch(() => reject(new ExtractRequestError("extract-failed")));
    };

    xhr.onerror = () => reject(new ExtractRequestError("extract-failed"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));

    xhr.send(file);
  });
}
