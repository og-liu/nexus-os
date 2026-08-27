// RSS 订阅源模块：数据层 + 抓取内核。
//
// 分层与 knowledge/store 一致（K3 定下的风格）：
// - 本文件：纯数据操作（同步、可注入、不碰网络）+ 一个「吃 XML 文本」的抓取内核，
//   内核不发起网络请求，所以能用内联 RSS 字符串做单元测试；
// - refreshFeed / refreshAllFeeds 是网络薄壳：负责真正去下载 XML，
//   fetcher 作为参数注入（生产传默认实现，测试传假实现）。
//
// 产品语义（product-vision 流水线）：订阅源更新 → 抓取 → 入 Inbox 等人审查。
// 机器只负责搬运，留不留由人在拍板队列里决定——和手动采集走同一条路。

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import Parser from "rss-parser";
import { createItem } from "@/lib/knowledge/store";
import { syncEmbedding } from "@/lib/knowledge/embedding-sync";
import { simhash64 } from "@/lib/knowledge/simhash";

/** 订阅源一行数据的形状（与 feeds 表列一一对应） */
export interface FeedRow {
  id: string;
  url: string;
  /** 显示名。添加时没填的话，首次抓取成功后用 RSS 频道自带的标题回填 */
  title: string;
  /** 1=启用 0=停用。停用的源定时任务跳过，但已采集的文章不受影响 */
  enabled: number;
  /** 上次成功抓取的时间戳；null = 从没成功抓过 */
  last_fetched_at: number | null;
  /** 最近一次报错信息；null = 上次是成功的。死源不会自己举手，靠这列发现 */
  last_error: string | null;
  created_at: number;
}

export function addFeed(
  conn: Database.Database,
  input: { url: string; title?: string },
): FeedRow {
  const url = input.url.trim();
  if (!url) throw new Error("订阅地址不能为空");

  const dup = conn.prepare("SELECT id FROM feeds WHERE url = ?").get(url);
  if (dup) throw new Error("该订阅地址已存在");

  const now = Date.now();
  const row: FeedRow = {
    id: randomUUID(),
    url,
    title: (input.title ?? "").trim(),
    enabled: 1,
    last_fetched_at: null,
    last_error: null,
    created_at: now,
  };
  conn
    .prepare(
      `INSERT INTO feeds (id, url, title, enabled, last_fetched_at, last_error, created_at)
       VALUES (@id, @url, @title, @enabled, @last_fetched_at, @last_error, @created_at)`,
    )
    .run(row);
  return row;
}

export function listFeeds(conn: Database.Database): FeedRow[] {
  return conn
    .prepare("SELECT * FROM feeds ORDER BY created_at ASC")
    .all() as FeedRow[];
}

export function getFeed(
  conn: Database.Database,
  id: string,
): FeedRow | undefined {
  return conn.prepare("SELECT * FROM feeds WHERE id = ?").get(id) as
    | FeedRow
    | undefined;
}

/** 退订：物理删除订阅源本身。已采集进库的文章不动（它们已经是知识条目了） */
export function removeFeed(conn: Database.Database, id: string): boolean {
  const r = conn.prepare("DELETE FROM feeds WHERE id = ?").run(id);
  return r.changes > 0;
}

export function setFeedEnabled(
  conn: Database.Database,
  id: string,
  enabled: boolean,
): FeedRow | undefined {
  conn
    .prepare("UPDATE feeds SET enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, id);
  return getFeed(conn, id);
}

// ─── 正文清洗 ────────────────────────────────────────────────
// RSS 的 content 字段经常是一坨 HTML。库里存纯文本（存储即单一事实源，
// 渲染归前端），所以剥掉标签、还原常见实体、压缩空白。

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 抓取内核：解析一段 RSS/Atom XML 并把新文章入库。
 *
 * 为什么吃 XML 字符串而不是自己去下载：
 * 1. 可测试——单测直接喂内联 XML，不需要 mock 网络；
 * 2. 职责单一——网络归 refreshFeed 薄壳管。
 *
 * 为什么是 async：rss-parser 的 parseString 不传回调时返回 Promise
 * （踩过的坑：当同步用拿到的只是个 Promise 对象，items 永远是空）。
 *
 * 去重规则：按文章链接（source_url）判断，库里见过的直接跳过。
 * 不用数据库唯一约束：手动采集可能合法地保存过重复链接，
 * 应用层查重更宽容，不会因为历史数据撞车导致整个迁移失败。
 */
export async function ingestFeedXml(
  conn: Database.Database,
  feed: FeedRow,
  xml: string,
): Promise<{ added: number; skipped: number }> {
  // customFields 显式声明才会解析出 content:encoded 这个命名空间字段
  // （很多 WordPress 源的全文在这里）；泛型标注让 TS 知道它是 unknown
  const parser: Parser<Record<string, unknown>> = new Parser({
    customFields: { item: ["content:encoded"] },
  });
  const parsed = await parser.parseString(xml);

  let added = 0;
  let skipped = 0;

  for (const item of parsed.items ?? []) {
    const link = typeof item.link === "string" ? item.link.trim() : "";
    if (!link) continue; // 没链接没法溯源也没法去重，跳过

    // ⚠️ 并发安全的隐含前提：从这里到下面 createItem(INSERT) 之间不许插入任何 await。
    // Node 单线程下连续的同步代码不会被其他任务打断，所以即使定时任务和手动刷新
    // 撞在一起，也不会出现「两边都查不到 → 重复入库」；中间一旦夹了 await 就失去这层保护。
    const exists = conn
      .prepare("SELECT id FROM knowledge_items WHERE source_url = ?")
      .get(link);
    if (exists) {
      skipped++;
      continue;
    }

    // 正文优先级：全文(content:encoded/content) > 摘要(contentSnippet)
    // 全文是 HTML 要清洗；摘要本身就是纯文本可直接用
    const rawHtml =
      typeof item["content:encoded"] === "string"
        ? item["content:encoded"]
        : typeof item.content === "string"
          ? item.content
          : "";
    const snippet =
      typeof item.contentSnippet === "string" ? item.contentSnippet : "";
    const content = rawHtml ? stripHtml(rawHtml) : snippet;
    // RSS 全文可能巨长，截断保底；这是「待拍板」素材不是档案，够用即可
    const clipped = content.slice(0, 5000);

    const row = createItem(conn, {
      title: (item.title ?? "(无标题)").trim().slice(0, 300),
      content: clipped,
      source: feed.title || feed.url, // 来源显示订阅名，没名字退 URL
      source_url: link,
      status: "inbox", // 产品流水线定的语义：自动采集进待拍板，人来决定留不留
      kind: "captured",
      // 内容指纹（重复检测）：RSS 条目也是查重的比对对象——手动采集撞上
      // 自动抓取（同一篇文章两个入口进来）全靠指纹拦。RSS 全文即快照
      // （content 本身就是本地存的正文），不需要额外 snapshot_html
      simhash: simhash64(`${item.title ?? ""}\n${clipped}`),
    });
    added++;

    // 复用 K4 写入钩子：入库后异步补语义指纹，失败只警告不阻塞采集
    void syncEmbedding(conn, row.id, row.title, row.content);
  }

  return { added, skipped };
}

/** 网络抓取函数的形状——测试时注入假实现用 */
export type FeedFetcher = (url: string) => Promise<string>;

/**
 * 默认实现：真实网络请求，15 秒超时防止死源拖垮整轮刷新。
 *
 * 为什么带浏览器 User-Agent：Node fetch 的默认 UA 是 "node"，
 * 很多站点/CDN（Cloudflare 防护最典型）见到陌生 UA 直接 403，
 * 表现为「源明明没错却一直抓失败」。我们只是每小时一次的低频个人抓取，
 * 借用浏览器 UA 是 RSS 阅读器的通行做法，能省掉大量无谓的排查。
 */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const defaultFetcher: FeedFetcher = async (url) => {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": BROWSER_UA },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

/**
 * 刷新单个订阅源：下载 XML → 内核入库 → 更新状态列。
 * 成功清空 last_error、记录 last_fetched_at；
 * 失败把错误写进 last_error 后原样抛出（调用方决定要不要继续）。
 */
export async function refreshFeed(
  conn: Database.Database,
  feed: FeedRow,
  fetcher: FeedFetcher = defaultFetcher,
): Promise<{ added: number; skipped: number }> {
  try {
    const xml = await fetcher(feed.url);

    // 回填必须发生在入库之前：ingest 给文章写 source 时读的是 feed.title，
    // 如果先入库再回填，第一批文章的来源只能退化为 URL，要等下一轮才正常。
    // 首次抓取成功且用户没给源起名：用 RSS 频道自带的标题回填显示名。
    if (!feed.title) {
      const channelTitle = extractChannelTitle(xml);
      if (channelTitle) {
        const named = channelTitle.slice(0, 100);
        conn.prepare("UPDATE feeds SET title = ? WHERE id = ?").run(named, feed.id);
        feed.title = named; // 内存对象也要同步改——只改库不改内存，本次入库拿到的还是旧值
      }
    }

    const result = await ingestFeedXml(conn, feed, xml);

    conn
      .prepare("UPDATE feeds SET last_fetched_at = ?, last_error = NULL WHERE id = ?")
      .run(Date.now(), feed.id);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    conn
      .prepare("UPDATE feeds SET last_error = ? WHERE id = ?")
      .run(msg.slice(0, 500), feed.id);
    throw err;
  }
}

function extractChannelTitle(xml: string): string {
  // 只取 <channel> 或 <feed> 里第一个 <title>，避免匹配到正文里的标题
  const m = xml.match(/<(?:channel|feed)[\s\S]*?<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

export interface RefreshAllResult {
  /** 刷新成功的源数量 */
  ok: number;
  /** 失败的源数量 */
  failed: number;
  added: number;
  skipped: number;
}

/**
 * 刷新所有启用的源。单源失败不影响其他源——
 * 一篇文章抓不到不应该让整条流水线停摆。
 */
export async function refreshAllFeeds(
  conn: Database.Database,
  fetcher: FeedFetcher = defaultFetcher,
): Promise<RefreshAllResult> {
  const feeds = listFeeds(conn).filter((f) => f.enabled === 1);
  const result: RefreshAllResult = { ok: 0, failed: 0, added: 0, skipped: 0 };

  for (const feed of feeds) {
    try {
      const r = await refreshFeed(conn, feed, fetcher);
      result.ok++;
      result.added += r.added;
      result.skipped += r.skipped;
    } catch {
      result.failed++; // 错误细节已经写进该源的 last_error，界面上能看到
    }
  }
  return result;
}
