// 手动采集的网页抓取器（2026-08-27 产品定稿：贴链接智能分流）。
//
// 职责：判断一条 URL 是「订阅地址」还是「普通网页」；普通网页则把
// 标题 / 摘要 / 正文抓回来。为什么不上 JSDOM + Readability 这类重型方案：
// 依赖体积和维护成本都高，而个人知识流要的是「把文章存下来能读」，
// 正则提取的纯文本已覆盖绝大多数场景；后续真有排版诉求再升级不迟。
//
// 失败语义（调研结论：绝不阻塞用户的保存动作）：
// - 订阅地址 → 返回 feed 标记，上层引导去「自动」页添加关注，不硬存成文章
// - 抓取失败 → 返回带人话原因的 error，上层降级为「按链接落库占位」

const FETCH_TIMEOUT_MS = 10_000; // 无超时的外部调用等于挂起炸弹（deepseek 事故教训）

// 伪装成桌面浏览器：不少站点（如阮一峰博客）对默认 UA 直接 403，
// 这是实测出的必要措施，不是可有可无的装饰
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type FetchPageResult =
  | { kind: "feed" }
  | {
      kind: "page";
      title: string;
      description: string;
      text: string;
      /** 剥净的正文 HTML（永久快照）：保留结构/链接/图片供阅读视图排版 */
      html: string;
    }
  | { kind: "error"; reason: string };

/** http/https 判定：贴链接分流的门槛。用 URL 解析而不是 startsWith 硬判——
 *  「https:evil」这类畸形串会被解析拒绝，不会误入抓取分支白耗一次超时。
 *  从 route 层挪到这里导出：refetch（重试抓取）也要用同一把尺子 */
export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** HTML 快照剥净：去掉脚本/样式/内嵌框架和所有事件属性、javascript: 伪协议。
 *  这是「存进库里的 HTML 永远可以被安全渲染」的底线——渲染侧的
 *  dangerouslySetInnerHTML 只信这个函数的产出，别处不允许裸渲染抓来的 HTML。
 *  正则做清洗不如 DOM 解析器严谨，但本地单人应用 + 已剥 script 标签、on 事件属性、js 伪协议，
 *  剩余风险（CSS 表达式早已被现代浏览器废弃）可接受 */
function sanitizeSnapshot(html: string): string {
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<(iframe|object|embed|form|button|svg)[\s\S]*?<\/\1>/gi, "")
    // 事件属性（onclick/onerror/…）：引号单双两种形态都剥
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    // javascript: 伪协议（可能夹空白和大小写混淆）
    .replace(/javascript\s*:/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const bodyMatch = out.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) out = bodyMatch[1];
  return out.trim();
}

/** 常见 HTML 实体解码：覆盖标题/摘要/正文里最常见的几个，够用即可，
 *  完整的 entity 对照表对这个场景是过度设计 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** 从 HTML 里抽取 meta 标签的 content（og:title / description 等）。
 *  meta 的属性顺序不保证（name 在前 / content 在前都合法），
 *  所以先把所有 meta 标签捞出来，逐条就地判断再取值 */
function metaContent(html: string, key: string): string | null {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const m of metas) {
    if (!new RegExp(`(?:name|property)=["']${key}["']`, "i").test(m)) continue;
    const c = m.match(/content=["']([^"']*)["']/i);
    if (c) return decodeEntities(c[1]).trim();
  }
  return null;
}

/** 抓取一条 URL。调用方负责先校验是合法 http(s) 链接 */
export async function fetchPage(rawUrl: string): Promise<FetchPageResult> {
  let res: Response;
  try {
    res = await fetch(rawUrl, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError") {
      return { kind: "error", reason: "网站响应太慢（超过 10 秒）" };
    }
    return { kind: "error", reason: "无法连接到该网站" };
  }

  if (res.status === 404) return { kind: "error", reason: "网页不存在（404）" };
  if (res.status === 403) return { kind: "error", reason: "该网站拒绝抓取（403）" };
  if (!res.ok) return { kind: "error", reason: `网站返回错误（HTTP ${res.status}）` };

  const body = await res.text().catch(() => "");
  if (!body) return { kind: "error", reason: "网站返回了空内容" };

  // ── 订阅地址识别：Content-Type 或正文根标签，二选一命中即判定 ──
  // 为什么不只看 Content-Type：不少站对 .xml 路径也回 text/html，
  // 看内容根标签才不漏。xhtml 是「用 XML 语法写的网页」，要排除掉
  const ctype = res.headers.get("content-type") ?? "";
  const head = body.slice(0, 2000).toLowerCase();
  const ctIsFeed = /xml|rss|atom/i.test(ctype) && !/xhtml/i.test(ctype);
  const looksLikeFeed =
    (ctIsFeed && !head.includes("<html")) ||
    head.includes("<rss") ||
    head.includes("<feed");
  if (looksLikeFeed) return { kind: "feed" };

  // ── 普通网页：抽标题 / 摘要 / 正文纯文本 ──
  const titleTag = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title =
    metaContent(body, "og:title") ??
    (titleTag ? decodeEntities(titleTag[1]).trim() : "");
  const description =
    metaContent(body, "og:description") ?? metaContent(body, "description") ?? "";

  // 正文：剥掉 script/style/注释和 head/nav/footer/aside 等非正文区，
  // 块级标签的收尾换成换行（保住段落结构），再统一去标签收纯文本。
  // 这够不上完美的「正文抽取」，但对「存档可读」绰绰有余
  let main = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(head|nav|footer|aside|header|svg|iframe|form|button)[\s\S]*?<\/\1>/gi,
      "",
    );
  const bodyMatch = main.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) main = bodyMatch[1];
  main = main
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  main = decodeEntities(main)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

  // 截断：超大页面（比如带海量评论的论坛页）只留前 5 万字符，
  // 防止单条目撑爆 SQLite 行和嵌入 API 的输入上限
  const text =
    main.length > 50_000
      ? `${main.slice(0, 50_000)}\n\n（正文过长，已截断）`
      : main;

  if (!text && !title) {
    return { kind: "error", reason: "页面里没有可保存的文字内容" };
  }
  // HTML 快照在正文文本之外单独剥净：text 的清洗链为了纯文本把标签全剥了，
  // 快照要的恰恰是标签（结构/链接/图片），两条清洗目标不同，各走各的。
  // 上限 50 万字符（约为纯文本上限的 10 倍，标签开销本身就大）：
  // 拦的是「单页几十 MB 的怪物页面」，正常长文远碰不到这条线
  const snapshotRaw = sanitizeSnapshot(body);
  const html =
    snapshotRaw.length > 500_000
      ? `${snapshotRaw.slice(0, 500_000)}<!-- 快照过大，已截断 -->`
      : snapshotRaw;
  return { kind: "page", title, description, text, html };
}
