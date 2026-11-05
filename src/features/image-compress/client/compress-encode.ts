"use client";

/**
 * 图片编码：全部交给 Web Worker（`image-worker.ts`）。
 *
 * - JPG 走 mozjpeg 的 WASM，PNG 走调色板量化 + oxipng；两边都在 Worker 里跑，
 *   主线程只负责画进度（同步 WASM 放主线程会把页面冻住）。
 * - **压不小会自动降一档质量重试**（Worker 里做），所以「编码出来比原图大」
 *   不会再被摆到用户面前。
 *
 * 这里只剩两件事：读尺寸（预览区状态条要显示）、把文件字节丢给 Worker。
 */

/** 解码出来的尺寸（只为状态条与输出方案，位图立刻释放，不驻留内存）。 */
export interface ImageProbe {
  width: number;
  height: number;
}

/**
 * 读一张图片的像素尺寸。
 *
 * `imageOrientation: "from-image"`：显式按 EXIF 摆正，否则手机照片会横躺，
 * 尺寸也会长宽颠倒。解码失败（文件坏了 / 改了名）直接抛错，由调用方提示
 * 「你的浏览器打不开这个格式」。
 */
export async function probeImage(file: File): Promise<ImageProbe> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export interface CompressedImage {
  blob: Blob;
  /** 实际使用的质量：自动降档后可能比请求的低。 */
  effectiveQuality: number;
}

interface WorkerResponse {
  id: number;
  buffer?: ArrayBuffer;
  effectiveQuality?: number;
  error?: string;
}

interface PendingJob {
  resolve: (result: { buffer: ArrayBuffer; effectiveQuality: number }) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextJobId = 0;
const pendingJobs = new Map<number, PendingJob>();

/** 懒创建 Worker：第一次点「开始压缩」时才拉 wasm 并起线程。 */
function getWorker(): Worker {
  if (worker) return worker;

  const instance = new Worker(new URL("./image-worker.ts", import.meta.url), {
    type: "module",
  });

  instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const job = pendingJobs.get(event.data.id);
    if (!job) return;
    pendingJobs.delete(event.data.id);
    if (event.data.buffer) {
      job.resolve({
        buffer: event.data.buffer,
        effectiveQuality: event.data.effectiveQuality ?? 0,
      });
    } else {
      job.reject(new Error(event.data.error ?? "压缩失败"));
    }
  };

  instance.onerror = (event) => {
    const error = new Error(event.message || "压缩线程出错");
    pendingJobs.forEach((job) => job.reject(error));
    pendingJobs.clear();
    worker?.terminate();
    worker = null;
  };

  worker = instance;
  return worker;
}

/**
 * 压缩一张图片：把原始字节交给 Worker（JPG 用 mozjpeg、PNG 用量化 + oxipng）。
 *
 * Worker 保证尽量比原图小：压不小会自动降质量重试，`effectiveQuality` 是最后
 * 实际用的那一档——调用方据此同步滑杆，免得「滑杆 95% 、结果是 85% 压的」。
 */
export async function compressImage(
  file: File,
  mime: "image/jpeg" | "image/png",
  quality: number,
): Promise<CompressedImage> {
  const buffer = await file.arrayBuffer();
  const instance = getWorker();

  const { buffer: output, effectiveQuality } = await new Promise<{
    buffer: ArrayBuffer;
    effectiveQuality: number;
  }>((resolve, reject) => {
    const id = ++nextJobId;
    pendingJobs.set(id, { resolve, reject });
    // 转移所有权：这块 buffer 交给 Worker 后主线程不再使用
    instance.postMessage({ id, buffer, mime, quality }, [buffer]);
  });

  return {
    blob: new Blob([new Uint8Array(output)], { type: mime }),
    effectiveQuality,
  };
}
