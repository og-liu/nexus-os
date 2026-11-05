import { MAX_BATCH_FILES, MAX_FILE_BYTES } from "./constants";
import { isVideoFile } from "./accept";

/**
 * 批量提取的准入规则（纯函数，可在 Node 里单测）。
 *
 * 判序：单文件规则（不是视频 / 超过 500 MB）→ 批次规则（超过 10 个）。
 * 被拒的文件**留在列表里并写明原因**，不影响同一批里合法的那些——
 * 悄悄少一个文件比拒绝更难排查。
 *
 * 和图片压缩的差别见 `constants.ts` 里 `MAX_BATCH_FILES` 的注释：那边卡的是内存，
 * 这边卡的是上传时间，所以没有「整批总大小」这道闸（服务器峰值永远只有一个文件）。
 */

export interface BatchFileInput {
  name: string;
  type: string;
  size: number;
}

export interface BatchContext {
  /** 这之前已经收下的合法文件数。 */
  acceptedCount: number;
}

/** 判定一个文件能不能进批次：返回原因（已跳过）或 `null`（可提取）。 */
export function batchRejectionReason(
  file: BatchFileInput,
  context: BatchContext,
): string | null {
  if (!isVideoFile(file)) return "只支持视频文件";
  if (file.size > MAX_FILE_BYTES) return "超过 500 MB，已跳过";
  if (context.acceptedCount >= MAX_BATCH_FILES) {
    return `超过每批 ${MAX_BATCH_FILES} 个，已跳过`;
  }
  return null;
}
