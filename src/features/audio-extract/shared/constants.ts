/**
 * 「音频提取」的常量（features/audio-extract/README.md §一）。
 *
 * 体积一律按 **1024 进制**，与 `ls -l` 和界面上的 `formatBytes` 同一套口径：
 * 500 MB = 500 × 1024 × 1024 字节。服务端与前端共用这一份，不许各写一个数。
 */

/** 单文件上限：500 MB。前端选中即拦，服务端再拦一次（`accept` 不是强制）。 */
export const MAX_FILE_BYTES = 500 * 1024 * 1024;

/**
 * 一批最多几个视频。
 *
 * 为什么和图片压缩（30 张 / 200 MB）不是一个量级：图片压缩是**在浏览器内存里**
 * 同时压一批，张数直接决定内存峰值；音频提取是**逐个上传、服务端逐个处理**，
 * 浏览器手里只有 File 引用和每首歌几 MB 的结果 Blob，服务器峰值永远只有一个文件。
 * 所以约束不是内存，而是「一个人的耐心」——10 个视频已经要传一阵子了。
 */
export const MAX_BATCH_FILES = 10;

/** 临时目录名（建在系统 tmp 下）——只放提取期间的输入与输出，请求结束就删。 */
export const TEMP_DIR_NAME = "nexus-os-audio";

/**
 * 孤儿清理阈值。
 *
 * `finally` 只能覆盖「进程还活着」的情况；进程被 OOM 杀掉、机器重启时，
 * 临时文件会留在盘上。所以每次请求开头顺手删掉超过 1 小时的残留，
 * 用一次目录扫描代替一个常驻定时任务。
 */
export const TEMP_ORPHAN_MS = 60 * 60 * 1000;

/** 转码目标码率：源已经是压缩格式，转码再给高也只是把体积做大。 */
export const TRANSCODE_BITRATE = "192k";

/** 一次 ffmpeg 调用的超时。2 核机器上转码一首歌是十几秒，5 分钟足够兜住异常。 */
export const FFMPEG_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 输入扩展名白名单。判断时 **MIME 或扩展名任一命中** 即放行：
 * 拖拽路径下 `File.type` 可能是空串，iOS 还可能给 `video/quicktime`。
 */
export const VIDEO_EXTENSIONS = [
  "mp4",
  "m4v",
  "mov",
  "mkv",
  "avi",
  "webm",
  "ts",
  "m2ts",
  "flv",
  "wmv",
  "3gp",
  "mpg",
  "mpeg",
  "ogv",
] as const;

/** 接口返回的错误码：前端据此挑文案，不靠解析中文。 */
export type ExtractErrorCode =
  | "unauthorized"
  | "too-large"
  | "not-video"
  | "no-audio"
  | "unreadable"
  | "extract-failed";
