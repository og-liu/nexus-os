// RSS 订阅源模块单测。
//
// 测试策略（与 K3/K4 一致的分层红利）：
// - 内核 ingestFeedXml 直接吃内联 XML 字符串，不需要 mock 网络；
// - 网络薄壳 refreshFeed/refreshAllFeeds 通过注入假 fetcher 测试；
// - syncEmbedding 被 mock 掉：单测不该打真实的嵌入 API。
//
// 注意：这里造知识条目数据不涉及 createItem 默认值问题——
// 条目全部由 ingestFeedXml 内部创建（status 显式传了 "inbox"）。

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/knowledge/embedding-sync", () => ({
  // 入库后的指纹同步在单测里是纯噪音，mock 成空操作
  syncEmbedding: vi.fn().mockResolvedValue(undefined),
}));

import { createInMemoryDb } from "@/lib/db";
import {
  addFeed,
  getFeed,
  listFeeds,
  removeFeed,
  setFeedEnabled,
  ingestFeedXml,
  refreshFeed,
  refreshAllFeeds,
  type FeedFetcher,
} from "./store";

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>阮一峰的网络日志</title>
  <item>
    <title>第一篇文章</title>
    <link>https://example.com/post-1</link>
    <content:encoded><![CDATA[<p>这是<b>正文</b>内容，含 &amp; 实体和<script>alert(1)</script>脚本。</p>]]></content:encoded>
  </item>
  <item>
    <title>第二篇文章</title>
    <link>https://example.com/post-2</link>
    <description>只有摘要的条目</description>
  </item>
  <item>
    <title>没有链接的条目</title>
    <description>应该被直接跳过</description>
  </item>
</channel>
</rss>`;

function makeFeedXml(title: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title></channel></rss>`;
}

describe("feeds 基础 CRUD", () => {
  it("添加订阅源并列出", () => {
    const conn = createInMemoryDb();
    const feed = addFeed(conn, { url: "https://a.com/rss.xml", title: "源A" });
    expect(feed.title).toBe("源A");
    expect(feed.enabled).toBe(1);
    expect(feed.last_fetched_at).toBeNull();
    expect(listFeeds(conn)).toHaveLength(1);
  });

  it("重复 URL 拒绝添加；空 URL 拒绝", () => {
    const conn = createInMemoryDb();
    addFeed(conn, { url: "https://a.com/rss.xml" });
    expect(() => addFeed(conn, { url: "https://a.com/rss.xml" })).toThrow(
      /已存在/,
    );
    expect(() => addFeed(conn, { url: "   " })).toThrow(/不能为空/);
  });

  it("启用/停用开关", () => {
    const conn = createInMemoryDb();
    const feed = addFeed(conn, { url: "https://a.com/rss.xml" });
    const off = setFeedEnabled(conn, feed.id, false)!;
    expect(off.enabled).toBe(0);
    const on = setFeedEnabled(conn, feed.id, true)!;
    expect(on.enabled).toBe(1);
  });

  it("退订只删源本身，已采集的文章保留", async () => {
    const conn = createInMemoryDb();
    const feed = addFeed(conn, { url: "https://a.com/rss.xml", title: "源A" });
    await ingestFeedXml(conn, feed, RSS_XML);

    expect(removeFeed(conn, feed.id)).toBe(true);
    expect(removeFeed(conn, feed.id)).toBe(false); // 再删一次不存在
    expect(listFeeds(conn)).toHaveLength(0);

    // 文章还在库里
    const items = conn
      .prepare("SELECT COUNT(*) AS n FROM knowledge_items WHERE source_url LIKE 'https://example.com/%'")
      .get() as { n: number };
    expect(items.n).toBe(2);
  });
});

describe("ingestFeedXml 抓取内核", () => {
  it("新文章入库：status=inbox、来源=订阅名、HTML 被清洗成纯文本", async () => {
    const conn = createInMemoryDb();
    const feed = addFeed(conn, { url: "https://a.com/rss.xml", title: "源A" });

    const r = await ingestFeedXml(conn, feed, RSS_XML);
    // 三条 item 里有一条没链接被跳过，不计入任何统计
    expect(r).toEqual({ added: 2, skipped: 0 });

    const first = conn
      .prepare("SELECT * FROM knowledge_items WHERE source_url = ?")
      .get("https://example.com/post-1") as Record<string, unknown>;

    expect(first.status).toBe("inbox"); // 产品流水线语义：自动采集进待拍板
    expect(first.kind).toBe("captured");
    expect(first.source).toBe("源A");
    expect(first.title).toBe("第一篇文章");
    // HTML 标签剥离 + script 清除 + &amp; 还原
    // 注：标签统一替换成单个空格（保证英文词距），中文里因此会有少量
    // 多余空格——对语义检索零影响，属可接受的简化，不为它上 HTML 解析器
    expect(first.content).toContain("这是");
    expect(first.content).toContain("正文");
    expect(first.content).not.toContain("<b>");
    expect(first.content).not.toContain("alert(1)");
    expect(first.content).toContain("& 实体");

    // 只有摘要的条目退而取 contentSnippet
    const second = conn
      .prepare("SELECT * FROM knowledge_items WHERE source_url = ?")
      .get("https://example.com/post-2") as Record<string, unknown>;
    expect(second.content).toBe("只有摘要的条目");
  });

  it("同一篇重复抓取按链接去重，全部跳过", async () => {
    const conn = createInMemoryDb();
    const feed = addFeed(conn, { url: "https://a.com/rss.xml", title: "源A" });
    await ingestFeedXml(conn, feed, RSS_XML);

    // 源更新了：旧两篇还在，新来一篇第三篇
    const updatedXml = RSS_XML.replace("</channel>", `
      <item><title>第三篇</title><link>https://example.com/post-3</link><description>d3</description></item>
    </channel>`);

    const r = await ingestFeedXml(conn, feed, updatedXml);
    expect(r).toEqual({ added: 1, skipped: 2 }); // 旧文跳过，只有新的入库

    const total = conn
      .prepare("SELECT COUNT(*) AS n FROM knowledge_items")
      .get() as { n: number };
    expect(total.n).toBe(3);
  });
});

describe("refreshFeed 刷新薄壳（注入假 fetcher）", () => {
  it("成功：记录抓取时间、清空错误、无名源回填频道标题", async () => {
    const conn = createInMemoryDb();
    const feed = addFeed(conn, { url: "https://a.com/rss.xml" }); // 故意不给名字
    expect(feed.title).toBe("");

    const okFetcher: FeedFetcher = async () => makeFeedXml("自动识别的名字");
    await refreshFeed(conn, feed, okFetcher);

    const after = getFeed(conn, feed.id)!;
    expect(after.title).toBe("自动识别的名字"); // 频道标题回填
    expect(after.last_fetched_at).not.toBeNull();
    expect(after.last_error).toBeNull();
  });

  it("无名源首抓：回填先于入库，首批文章来源就是频道标题而非 URL", async () => {
    const conn = createInMemoryDb();
    const feed = addFeed(conn, { url: "https://a.com/rss.xml" }); // 故意不给名字

    await refreshFeed(conn, feed, async () => RSS_XML);

    const first = conn
      .prepare("SELECT source FROM knowledge_items WHERE source_url = ?")
      .get("https://example.com/post-1") as { source: string };
    // 修复前这里是 URL——因为回填发生在入库之后，首批文章只能拿到空名字
    expect(first.source).toBe("阮一峰的网络日志");
  });

  it("失败：错误写进 last_error 并上抛", async () => {
    const conn = createInMemoryDb();
    const feed = addFeed(conn, { url: "https://dead.com/rss.xml", title: "死源" });

    const badFetcher: FeedFetcher = async () => {
      throw new Error("HTTP 503");
    };
    await expect(refreshFeed(conn, feed, badFetcher)).rejects.toThrow("HTTP 503");

    const after = getFeed(conn, feed.id)!;
    expect(after.last_error).toBe("HTTP 503");
    expect(after.last_fetched_at).toBeNull(); // 从没成功过
  });
});

describe("refreshAllFeeds 批量刷新", () => {
  it("单源失败不拖垮其他源，结果如实统计", async () => {
    const conn = createInMemoryDb();
    const good = addFeed(conn, { url: "https://good.com/rss.xml", title: "好源" });
    const bad = addFeed(conn, { url: "https://bad.com/rss.xml", title: "坏源" });
    const off = addFeed(conn, { url: "https://off.com/rss.xml", title: "停用源" });
    setFeedEnabled(conn, off.id, false);

    // 按 URL 分发假响应：好源吐真 XML，坏源抛错，停用源根本不该被调用
    const mixedFetcher: FeedFetcher = async (url) => {
      if (url === good.url) return RSS_XML;
      throw new Error("connection refused");
    };

    const r = await refreshAllFeeds(conn, mixedFetcher);
    expect(r.ok).toBe(1); // 只算好源
    expect(r.failed).toBe(1);
    expect(r.added).toBe(2); // 好源的兩篇入库

    expect(getFeed(conn, bad.id)!.last_error).toBe("connection refused");
    // 停用源未被触碰：无时间无错误
    const offRow = getFeed(conn, off.id)!;
    expect(offRow.last_fetched_at).toBeNull();
    expect(offRow.last_error).toBeNull();
  });
});
