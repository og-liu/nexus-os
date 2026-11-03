/**
 * `Content-Disposition` 响应头的值（RFC 5987）。
 *
 * 从《功能/音频提取》的 `filename.ts` 提升到这里：抖音下载也需要给下载下来的
 * 视频取名，两个功能各写一份迟早会漂移（一个忘了百分号编码，中文名就变成乱码）。
 *
 * 只写 `filename="中文.mp4"` 时，浏览器对非 ASCII 的处理各家不一样，
 * 存下来常常是乱码或干脆叫 `download`。所以给两个字段：
 * `filename=` 放一个 ASCII 兜底名，`filename*=` 放按 UTF-8 百分号编码的真名——
 * 认 `filename*` 的浏览器（现代浏览器全认）用真名，其余用兜底名。
 */
/**
 * 去掉**孤立的 UTF-16 代理项**（半个 emoji）。
 *
 * 抖音的标题是「用户输入 + 平台拼接」，偶尔会出现一个没配对的高/低代理项。
 * 这种字符在屏幕上看着正常，但 `encodeURIComponent` 碰到它会直接抛
 * `URIError: URI malformed`——实测后果是下载接口 500，而库里那条记录的标题
 * 肉眼完全看不出问题。文件系统同样写不出它，所以一律删掉。
 *
 * 用正则而不是 `toWellFormed()`：后者是 ES2024，TS 的 lib 版本不一定声明了它。
 */
export function stripLoneSurrogates(text: string): string {
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );
}

export function contentDisposition(filename: string): string {
  // 先清掉孤立代理项：不清的话下面的 encodeURIComponent 会抛，整个响应用 500 结束
  const safe = stripLoneSurrogates(filename);
  const fallback = safe.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
