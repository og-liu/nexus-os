// 重复检测的算法层（阶段2 P0）。
//
// 两个武器，各管一种「重复」：
// - normalizeUrl：同一条链接因为带了跟踪参数 / 尾斜杠 / #hash 而长得不一样——
//   归一化后精确比对。拦的是「同一个 URL 存两遍」。
// - simhash64：不同链接指向同一篇文章（转载 / 镜像 / 手动采集撞上 RSS）——
//   文本指纹近似比对。SimHash 的特性是「局部改动只翻转少数几位」，
//   汉明距离 ≤3 即判为高度相似，拦的是「同一内容换了个地址」。
//
// 为什么不上向量余弦：这里要的是「是否重复」的二值判断，不是语义相关性排序；
// SimHash 纯位运算、无外部依赖、毫秒级，是正文查重的业界成熟做法（Google 网页去重同款思路）。

/** URL 归一化：剥跟踪参数、去 #hash、去尾斜杠。
 *  只白名单剥「确认无内容语义」的分析参数——query 一刀切全剥是错的，
 *  不少页面的 ?p=2 / ?id=xxx 承载真实内容，剥了会把不同文章判成同一篇 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "spm", // 百度系
  "from",
  "ref",
  "referrer",
  "share_token", // 微信系
  "fbclid", // Meta
  "gclid", // Google Ads
]);

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = ""; // #hash 是页内锚点，跟内容无关
    const kept: Array<[string, string]> = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (!TRACKING_PARAMS.has(k.toLowerCase())) kept.push([k, v]);
    }
    u.search = "";
    for (const [k, v] of kept) u.searchParams.append(k, v);
    let href = u.toString();
    // 尾斜杠归一：example.com/a/ 与 example.com/a 是同一页。
    // 根路径的 / 保留（example.com/ 剥掉就成 example.com 了，反而与带端口的形式不一致）
    if (u.pathname !== "/" && href.endsWith("/")) href = href.slice(0, -1);
    return href;
  } catch {
    // 解析不了的串原样返回——调用方拿它做相等比对，失败可比对成功更安全
    return raw;
  }
}

/** 分词：英文按单词（小写化），中文按 2-gram。
 *  中文为什么用 2-gram 而不是逐字：单字频率区分度太低（「的」「了」满天飞），
 *  相邻两字组成的词片段才有指纹意义；jieba 这类分词器依赖太重，2-gram 是零依赖下的够用解 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const latin = text.match(/[A-Za-z0-9]+/g) ?? [];
  for (const w of latin) tokens.push(w.toLowerCase());
  const cjk = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const seg of cjk) {
    for (let i = 0; i < seg.length - 1; i++) {
      tokens.push(seg.slice(i, i + 2));
    }
  }
  return tokens;
}

/** FNV-1a 64 位哈希：短小、分布均匀、无依赖，SimHash 标配的散列函数 */
function fnv1a64(str: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
}

/** SimHash 64 位指纹：返回 16 位 hex 字符串；空文本返回空串（无指纹可言，调用方跳过比对）。
 *  存 hex 而不是 number：64 位超出 JS 安全整数范围，number 会丢精度，
 *  hex ↔ BigInt 的转换是无损且直观的 */
export function simhash64(text: string): string {
  const tokens = tokenize(text);
  if (tokens.length === 0) return "";

  // 词频作权重：转载文章的「正文主体」贡献大、偶然的多余小字影响小
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);

  const weights = new Array<number>(64).fill(0);
  for (const [tok, w] of freq) {
    const h = fnv1a64(tok);
    for (let i = 0; i < 64; i++) {
      weights[i] += (h >> BigInt(i)) & 1n ? w : -w;
    }
  }

  let result = 0n;
  for (let i = 0; i < 64; i++) {
    if (weights[i] > 0) result |= 1n << BigInt(i);
  }
  return result.toString(16).padStart(16, "0");
}

/** 汉明距离：两个 16 位 hex 指纹间不同的位数。
 *  判重阈值由调用方定（业务上 ≤3 视为近似重复），这里只提供无立场的计算 */
export function hammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64; // 形状不对就当完全不相关
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let dist = 0;
  while (x) {
    dist += Number(x & 1n);
    x >>= 1n;
  }
  return dist;
}
