/**
 * HTTP Range 解析（features/music-player/README.md §七第 2 条）。
 *
 * 播放器要能拖动进度，就必须让浏览器只取中间一段。**Safari 尤其硬性**：
 * 它对音频请求发 `Range: bytes=0-`，服务端回 200 全量时它会直接放弃播放——
 * 这个失败在 Chrome 上完全看不出来，只会在 Safari 上表现为「点了没反应」。
 *
 * 三种合法写法（RFC 9110 §14）：
 *   bytes=100-200   闭区间，两端都可能超出文件末尾
 *   bytes=100-      从 100 到结尾
 *   bytes=-500      最后 500 字节
 * 其余（多段、单位不是 bytes、start > end）一律当作没写 Range —— 回 200 全量，
 * 而不是 416：播放器拿到全量仍能播，416 会让它直接报错。
 */

/** 解析结果：`null` = 没有可用的 Range（回 200 全量）。 */
export interface ByteRange {
  start: number;
  /** 含右端点，已按文件大小截断 */
  end: number;
}

export function parseRange(header: string | null, size: number): ByteRange | null {
  if (!header) return null;
  if (size <= 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;

  if (rawStart === "") {
    // bytes=-N：最后 N 字节
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    if (!Number.isFinite(start) || start < 0) return null;
    // 起点超出文件末尾：没有可给的内容
    if (start >= size) return null;
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
    if (!Number.isFinite(end) || end < start) return null;
    if (end >= size) end = size - 1;
  }

  return { start, end };
}

/** `Content-Range` 头的值；长度按闭区间算（end 含在内）。 */
export function contentRangeHeader(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}
