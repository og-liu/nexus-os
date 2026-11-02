/**
 * 输出文件名（《功能/音频提取》§四「输出文件名」）。
 *
 * 抖音、视频号下载下来的文件名常带 emoji、井号、空格，有的还带路径分隔符
 * （从某些站点直接下载时会拼出 `../` 这类东西）。这些字符要么在文件系统里非法，
 * 要么在 URL 里有特殊含义，所以统一换成 `-`——但**中文与 emoji 保留**，
 * 它们是文件名的有效内容，不是噪音。
 */

/**
 * 会被替换成 `-` 的字符：
 * - 文件系统非法：`/ \ : * ? " < > |`
 * - URL 里有特殊含义：`#`（片段标识符）、`%`（转义起始符）
 * - 控制字符：0x00–0x1F、0x7F
 */
const ILLEGAL = /[\\/:*?"<>|#%\u0000-\u001F\u007F]/g;

/** 连字符、空格、点的重复与首尾修剪——Windows 会吃掉结尾的点和空格。 */
function tidy(name: string): string {
  return name
    .replace(ILLEGAL, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, "");
}

/** 去掉最后一个扩展名（`a.b.mp4` → `a.b`）；没有扩展名就原样返回。 */
export function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * 生成输出文件名：源文件名去扩展名 + 新扩展名。
 *
 * 清完之后什么都不剩（比如整个名字都是非法字符）就退回 `audio`，
 * 不然会得到一个 `.m4a` 这种以点开头的隐藏文件。
 */
export function outputFilename(sourceName: string, extension: string): string {
  const base = tidy(stripExtension(sourceName.trim()));
  return `${base || "audio"}${extension}`;
}

/**
 * `Content-Disposition` 的值（RFC 5987）。
 *
 * 只写 `filename="中文.m4a"` 时，浏览器对非 ASCII 的处理各家不一样，
 * 存下来常常是乱码或干脆叫 `download`。所以给两个字段：
 * `filename=` 放一个 ASCII 兜底名，`filename*=` 放按 UTF-8 百分号编码的真名——
 * 认 `filename*` 的浏览器（现代浏览器全认）用真名，其余用兜底名。
 */
export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
