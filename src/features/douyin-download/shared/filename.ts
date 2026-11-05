import { stripLoneSurrogates } from "@/lib/content-disposition";

/**
 * 下载文件名（features/douyin-download/README.md §七第 3 条）。
 *
 * 抖音的标题天生不适合当文件名：带 `#话题`、带 emoji、偶尔带斜杠和引号
 * （`/` 在 Windows 上是路径分隔符，`*?:"<>|` 直接非法）。这些统一换成 `-`，
 * 但**中文和 emoji 保留**——它们是标题的有效内容，不是噪音。
 *
 * 另外要先清掉**孤立代理项**（半个 emoji）：它会让下游的 `encodeURIComponent`
 * 抛 `URIError`，文件系统也写不出来（见 `lib/content-disposition.ts`）。
 */

/**
 * 会被替换成 `-` 的字符：
 * - 文件系统非法：斜杠、反斜杠、冒号、星号、问号、双引号、尖括号、竖线
 * - URL 里有特殊含义：`#`（片段标识符）、`%`（转义起始符）
 * - 控制字符：0x00–0x1F、0x7F
 */
const ILLEGAL = /[\\/:*?"<>|#%\u0000-\u001F\u007F]/g;

/** 文件名主干的长度上限。太长的标题在部分文件管理器里会被截断到看不出是什么。 */
const MAX_LENGTH = 60;

/**
 * 用标题生成 `.mp4` 文件名；标题清完什么都不剩时退回 `douyin-<作品 id>`。
 *
 * 结尾的点和空格会被 Windows 悄悄吃掉，所以要再剥一次——不然
 * 「标题.」会变成「标题.」，用户看到的名字和存下来的名字对不上。
 *
 * **孤立代理项的清洗放在最后一步**：`slice(0, 60)` 按 UTF-16 码元切，
 * 切点正好落在 emoji 的两个代理项中间时，会凭空造出一个孤立代理项——
 * 而原始标题里本来一个都没有（实测那条 1548 字的标题就是这样炸的）。
 */
export function toVideoFilename(title: string, awemeId: string): string {
  const base = stripLoneSurrogates(
    title
      .replace(ILLEGAL, "-")
      .replace(/-{2,}/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[.\s-]+|[.\s-]+$/g, "")
      .slice(0, MAX_LENGTH)
      .replace(/[.\s-]+$/, "")
      .trim(),
  );

  return `${base || `douyin-${awemeId}`}.mp4`;
}
