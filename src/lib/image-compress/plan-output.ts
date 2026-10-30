/**
 * 输出方案决策（《功能/图片压缩》§四）：给定源图信息，
 * 算出**输出格式、质量是否生效、输出像素尺寸**。
 *
 * 这里只有纯函数，不碰 `canvas` / `ImageBitmap`——那些是浏览器的事，
 * 落在 `"use client"` 的视图层。这样格式规则能被单测钉住，
 * 不用为了「PNG 该出什么」开一次浏览器。
 *
 * **只收 JPG / JPEG / PNG 三种输入**（2026-10-30 联调定的白名单）：其余格式
 * （WebP、GIF、HEIC、BMP…）在载入时就被 `isSupportedImage` 挡掉，根本走不到这里。
 *
 * 格式规则（2026-10-30 联调改定）：
 * - **JPG → JPG**：质量滑杆生效，用 canvas 按质量重编码（有损）。
 * - **PNG → PNG**（不管有没有透明）：**调色板量化**（imagequant，`imagequant` 包）
 *   + oxipng 无损收尾——PNG 能真正变小（50–80%），代价是颜色变少（有损）。
 *   质量滑杆在 PNG 上控制**调色板颜色数**（0.95 ≈ 256 色、0.5 ≈ 16 色）。
 *   **不做格式转换**：透明 PNG 依旧输出 PNG（早先「透明 PNG → WebP」的方案已被联调否掉）。
 *
 * **不缩放**：2026-10-30 联调去掉了「最大边长」参数，输出像素尺寸恒等于源图。
 */

/** 输出格式：只有 JPG / PNG 两种，不换格式。 */
export type OutputFormat = "jpeg" | "png";

/** 源图信息：类型经 `sourceMime` 归一化过，尺寸来自解码结果。 */
export interface SourceImageInfo {
  /** 源图 MIME（白名单内只有 `image/jpeg` / `image/png`）。 */
  type: string;
  width: number;
  height: number;
}

/** 一次压缩的输出方案。 */
export interface OutputPlan {
  format: OutputFormat;
  /** 输出 MIME。 */
  mime: "image/jpeg" | "image/png";
  /** 下载文件名的扩展名（JPG 用 `jpg`，不用 `jpeg`）。 */
  extension: "jpg" | "png";
  /** 界面上显示的格式名。 */
  label: "JPG" | "PNG";
  /** 输出像素尺寸。 */
  width: number;
  height: number;
}

const FORMAT_META: Record<
  OutputFormat,
  Pick<OutputPlan, "mime" | "extension" | "label">
> = {
  jpeg: { mime: "image/jpeg", extension: "jpg", label: "JPG" },
  png: { mime: "image/png", extension: "png", label: "PNG" },
};

/** 按源图类型决定输出格式：PNG 还是 PNG，其余按 JPG 处理（白名单外进不来）。 */
export function resolveFormat(type: string): OutputFormat {
  return type === "image/png" ? "png" : "jpeg";
}

/**
 * 输入白名单：**只支持 JPG / JPEG / PNG**（2026-10-30 联调）。
 *
 * MIME 与扩展名任一命中就放行——拖拽路径下 `File.type` 可能是空串，
 * 而改名文件（`.txt` → `.jpg`）也得走到解码那一步再报「打不开这个格式」，
 * 不能在这里按扩展名判死。GIF 由 `isGif` 单独处理（要给它「动图」的说明）。
 */
export function isSupportedImage(name: string, type: string): boolean {
  if (type === "image/jpeg" || type === "image/png") return true;
  return /\.(jpe?g|png)$/i.test(name);
}

/**
 * 归一化源图 MIME：浏览器偶尔给不出 `File.type`（空串），
 * 白名单只有 JPG / PNG 两种，按扩展名补上；否则 `resolveFormat` 会把 JPG 当未知格式。
 */
export function sourceMime(
  name: string,
  type: string,
): "image/jpeg" | "image/png" {
  if (type === "image/jpeg" || type === "image/png") return type;
  return /\.png$/i.test(name) ? "image/png" : "image/jpeg";
}

/**
 * 是不是 GIF（动图）。
 *
 * MIME 与扩展名都看：有些系统（或改名文件）给不出 `image/gif`，
 * 但扩展名还是 `.gif`。GIF 一律拒绝——`canvas` 只画第一帧，
 * 压完动图变静图，是无声的毁图（文档 §四「GIF / 动图」）。
 */
export function isGif(name: string, type: string): boolean {
  return type === "image/gif" || /\.gif$/i.test(name);
}

/** 下载文件名：`<原名去掉扩展名>-compressed.<新扩展名>`。 */
export function outputFilename(originalName: string, extension: string): string {
  const dot = originalName.lastIndexOf(".");
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base || "image"}-compressed.${extension}`;
}

/** 由源图信息算出完整输出方案（输出尺寸 = 源图尺寸，不缩放）。 */
export function planOutput(source: SourceImageInfo): OutputPlan {
  const format = resolveFormat(source.type);

  return {
    format,
    ...FORMAT_META[format],
    width: source.width,
    height: source.height,
  };
}
