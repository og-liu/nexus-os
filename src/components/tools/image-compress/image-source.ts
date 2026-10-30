"use client";

import { planOutput, sourceMime, type OutputPlan } from "@/lib/image-compress/plan-output";
import { compressImage, probeImage } from "./compress-encode";

/**
 * 「一张已载入的图片」与「一次压缩结果」的类型和纯操作。
 *
 * 从 `use-image-compress` 里拆出来：那个 hook 已经被联调加到了 400 行，
 * 超过项目「单文件约 300 行」的硬指标。这里只放**不依赖 React 状态**的部分，
 * 视图与 hook 共用同一套类型。
 */

/** 已载入的原图。 */
export interface LoadedSource {
  name: string;
  size: number;
  type: string;
  /** 原始文件：编码在 Worker 里做，主线程只把字节传过去。 */
  file: File;
  width: number;
  height: number;
  /** 原图的 object URL（对比滑块底下那一层）。 */
  originalUrl: string;
}

/**
 * 一次压缩的结果。
 *
 * - `compressed`：真的变小了，给出 object URL 与字节数，可下载、可对比；
 * - `not-smaller`：优化 / 重编码没有变小（PNG 已压到极限、JPG 极高质量等）。
 *   **不提供更大的文件**——结果区只说明「压不动」，不生成下载。
 */
export type CompressOutcome =
  | {
      kind: "compressed";
      url: string;
      size: number;
      /** 产生这个结果的输出方案：尺寸 / 格式与它绑定，不能拿当前方案顶替。 */
      plan: OutputPlan;
      /** 用户当时设的质量（可能被自动降档）。 */
      requestedQuality: number;
      /** 实际使用的质量。 */
      effectiveQuality: number;
    }
  | {
      kind: "not-smaller";
      /** 试出来的字节数（不比原图小），只用于说明，不给下载。 */
      attemptedSize: number;
      /** 试到哪一档质量仍然压不小（判断是不是已经到底）。 */
      attemptedQuality: number;
      plan: OutputPlan;
    };

/** 释放一张原图占的内存：object URL。 */
export function disposeSource(source: LoadedSource): void {
  URL.revokeObjectURL(source.originalUrl);
}

/** 由源图信息算输出方案（输出尺寸 = 源图尺寸）。 */
export function planFor(source: LoadedSource): OutputPlan {
  return planOutput({
    type: source.type,
    width: source.width,
    height: source.height,
  });
}

/** 读尺寸并组装成 `LoadedSource`；失败时抛错（由调用方提示）。 */
export async function buildSource(file: File): Promise<LoadedSource> {
  const type = sourceMime(file.name, file.type);
  const { width, height } = await probeImage(file);

  return {
    name: file.name,
    size: file.size,
    type,
    file,
    width,
    height,
    originalUrl: URL.createObjectURL(file),
  };
}

/** 交给 Worker 编码（JPG 用 mozjpeg，PNG 用量化 + oxipng），返回实际使用的质量。 */
export function encodeSource(
  source: LoadedSource,
  plan: OutputPlan,
  quality: number,
) {
  return compressImage(source.file, plan.mime, quality);
}
