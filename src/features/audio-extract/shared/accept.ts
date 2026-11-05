import { MAX_FILE_BYTES, VIDEO_EXTENSIONS } from "./constants";

/**
 * 选文件这一关的准入判断（纯函数）。
 *
 * 为什么要 MIME **或** 扩展名任一命中：拖拽路径下 `File.type` 可能是空串，
 * iOS 选视频时给的是 `video/quicktime` 而不是 `video/mp4`，只看一个都会误杀。
 * 反过来，`accept` 属性只是给文件对话框的提示，**不是强制**——用户仍然能选任意文件，
 * 所以真正的拦截在这里和服务端各做一次。
 */

export type RejectionCode = "not-video" | "too-large";

/** 是不是视频：MIME 以 `video/` 开头，或扩展名在白名单里。 */
export function isVideoFile(file: { name: string; type: string }): boolean {
  if (file.type.toLowerCase().startsWith("video/")) return true;
  const dot = file.name.lastIndexOf(".");
  if (dot < 0) return false;
  const ext = file.name.slice(dot + 1).toLowerCase();
  return (VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

/** 返回拒绝原因；`null` 表示可以进下一步。 */
export function rejectionReason(file: {
  name: string;
  type: string;
  size: number;
}): RejectionCode | null {
  if (!isVideoFile(file)) return "not-video";
  if (file.size > MAX_FILE_BYTES) return "too-large";
  return null;
}
