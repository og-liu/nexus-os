/**
 * 批量压缩的准入规则（纯函数，可在 Node 里单测）。
 *
 * 为什么要上限：
 * - 批量是把一组文件**同时**留在内存里（File 引用 + 逐张结果 Blob + 打包 ZIP），
 *   不设上限时拖 100 张 20 MB 的图足以把标签页顶爆；
 * - ZIP 打包是一次性在内存里拼出整个包（store 模式），总量越大峰值越高。
 *
 * 单张上限沿用 `MAX_FILE_BYTES`（20 MB），与单张模式一致；
 * 整批再给「张数」和「总大小」两道闸，超出部分逐条标「已跳过」并写明原因，
 * **不影响同一批里合法的那些张**。
 */

import { MAX_FILE_BYTES } from "./constants";
import { isGif, isSupportedImage } from "./plan-output";

/** 一批最多收多少张。 */
export const MAX_BATCH_FILES = 30;
/** 一批的原始总大小上限（200 MB）。 */
export const MAX_BATCH_BYTES = 200 * 1024 * 1024;

export interface BatchFileInput {
  name: string;
  type: string;
  size: number;
}

export interface BatchContext {
  /** 这之前已经收下的合法张数。 */
  acceptedCount: number;
  /** 这之前已经收下的合法总字节。 */
  acceptedBytes: number;
}

/**
 * 判定一个文件能不能进批次：返回原因（已跳过）或 `null`（可压）。
 *
 * 顺序：单文件规则（体积 / 动图 / 格式）→ 批次规则（张数 / 总量）。
 */
export function batchRejectionReason(
  file: BatchFileInput,
  context: BatchContext,
): string | null {
  if (file.size > MAX_FILE_BYTES) return "超过 20 MB，已跳过";
  if (isGif(file.name, file.type)) return "GIF / 动图暂不支持";
  if (!isSupportedImage(file.name, file.type)) return "只支持 JPG / PNG";
  if (context.acceptedCount >= MAX_BATCH_FILES) {
    return `超过每批 ${MAX_BATCH_FILES} 张，已跳过`;
  }
  if (context.acceptedBytes + file.size > MAX_BATCH_BYTES) {
    return "整批总大小超过 200 MB，已跳过";
  }
  return null;
}
