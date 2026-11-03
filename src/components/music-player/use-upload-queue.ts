"use client";

import { useCallback, useRef, useState } from "react";
import { AUDIO_EXTENSIONS, extensionOf, isAcceptedExtension } from "@/lib/music-player/formats";

/**
 * 上传队列（《功能/音乐播放器》§2.1、§四第 7 条）。
 *
 * 两件事只在这么一处：
 * 1. **进度只能用 XHR 拿**——`fetch` 至今没有上传进度事件，200 MB 的文件没有进度条，
 *    用户会以为卡死并重传；
 * 2. **串行上传**：一次只发一个。并发发十个会把浏览器连接池占满（上传期间页面别的
 *    请求全卡住），而且失败时也说不清是哪一首。
 */

export type UploadStatus = "queued" | "uploading" | "done" | "error";

export interface UploadItem {
  key: string;
  name: string;
  size: number;
  /** 0..1 */
  progress: number;
  status: UploadStatus;
  /** 失败原因（status 为 error 时有值） */
  message?: string;
}

interface UploadResponse {
  error?: string;
}

/** 发一首。成功 resolve，失败 reject 一个带人话 message 的 Error。 */
function uploadOne(file: File, onProgress: (ratio: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/tools/music-player/tracks");
    // 文件名走自定义头。必须编码：中文与空格在请求头里是非法的裸字节
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = "上传失败";
      try {
        const body = JSON.parse(xhr.responseText) as UploadResponse;
        if (body.error) message = body.error;
      } catch {
        // 响应不是 JSON（网关报错页等），用兜底文案
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("网络中断了，换一个网络再试"));
    xhr.onabort = () => reject(new Error("上传被中断"));
    xhr.ontimeout = () => reject(new Error("上传超时了"));

    xhr.send(file);
  });
}

export function useUploadQueue(onUploaded: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  // 用 ref 防重入：`busy` 是 state，同一帧里连点两次读到的还是旧值
  const running = useRef(false);

  const patch = useCallback((key: string, next: Partial<UploadItem>) => {
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, ...next } : item)),
    );
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (running.current) return;

      // 本地先筛一遍扩展名：不符的当场标红，不必等一个来回
      const entries = files.map((file, index) => {
        const key = `${Date.now()}-${index}-${file.name}`;
        const accepted = isAcceptedExtension(extensionOf(file.name));
        const item: UploadItem = {
          key,
          name: file.name,
          size: file.size,
          progress: 0,
          status: accepted ? "queued" : "error",
          message: accepted
            ? undefined
            : `只支持 ${AUDIO_EXTENSIONS.join(" / ")} 格式`,
        };
        return { file, item };
      });

      setItems((previous) => [...previous, ...entries.map((entry) => entry.item)]);

      const pending = entries.filter((entry) => entry.item.status === "queued");
      if (pending.length === 0) return;

      running.current = true;
      setBusy(true);

      let uploaded = 0;
      for (const { file, item } of pending) {
        patch(item.key, { status: "uploading" });
        try {
          await uploadOne(file, (ratio) => patch(item.key, { progress: ratio }));
          patch(item.key, { status: "done", progress: 1 });
          uploaded += 1;
        } catch (error) {
          patch(item.key, {
            status: "error",
            message: error instanceof Error ? error.message : "上传失败",
          });
        }
      }

      running.current = false;
      setBusy(false);

      if (uploaded > 0) onUploaded();
    },
    [onUploaded, patch],
  );

  /** 清掉已经结束的记录；正在传的不动。 */
  const clearFinished = useCallback(() => {
    setItems((previous) =>
      previous.filter((item) => item.status === "queued" || item.status === "uploading"),
    );
  }, []);

  return { items, busy, addFiles, clearFinished };
}
