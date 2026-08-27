// OPML 导入导出接口（阶段4 P2）：订阅一键迁移。
//
// GET  /api/feeds/opml → 导出全部订阅为 .opml 文件（浏览器直接下载）
// POST /api/feeds/opml → 导入（body: { xml: string }，前端读文件文本传上来）
//
// OPML 是 RSS 阅读器之间的通用交换格式（outline 嵌套树，订阅源挂在
// xmlUrl 属性上）。不用 XML 解析库：我们要的只有 outline 的两个属性，
// 一个正则足够——为「读两个属性」引入整棵解析器依赖不值当。
//
// 导入不自动抓取：一份 OPML 常有几十个源，逐个现场抓要几分钟（外网
// RSS 更慢），请求早超时了。入库完让用户在列表里刷新或等整点自动抓——
// 单个手动添加才有「立即见货」的即时感，批量导入的正确语义是「先到位」

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { addFeed, listFeeds } from "@/lib/feeds/store";

export const runtime = "nodejs";

export async function GET() {
  const feeds = listFeeds(getDb());

  // OPML 2.0 最小合法结构。title/body 文本随意，阅读器认的是 outline 行
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const outlines = feeds
    .map(
      (f) =>
        `    <outline type="rss" text="${escape(f.title || f.url)}" title="${escape(f.title || f.url)}" xmlUrl="${escape(f.url)}" />`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Nexus OS 订阅</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>`;

  // 中文文件名按 RFC 5987 编码，老浏览器才会正确存成 .opml 而不是乱码名
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "text/x-opml; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexus-os-subscriptions.opml"; filename*=UTF-8''${encodeURIComponent("NexusOS订阅.opml")}`,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const xml = typeof body?.xml === "string" ? body.xml : "";
  if (!xml.trim()) {
    return NextResponse.json({ error: "请提供 OPML 文件内容" }, { status: 400 });
  }

  // 逐个提取 <outline ... xmlUrl="..."> 的 xmlUrl 与 title/text 属性。
  // 属性顺序各家导出器不一样，不能假设 xmlUrl 在固定位置；属性值里的
  // 实体（&amp; 等）还原成原字符再入库
  const entries: Array<{ url: string; title: string }> = [];
  const seen = new Set<string>();
  const outlineRe = /<outline\b[^>]*>/gi;
  const attr = (tag: string, name: string): string => {
    const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
    if (!m) return "";
    return m[1]
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
  };

  for (const m of xml.matchAll(outlineRe)) {
    const tag = m[0];
    const url = attr(tag, "xmlUrl").trim();
    if (!url || !/^https?:\/\//i.test(url)) continue; // 文件夹节点没有 xmlUrl
    if (seen.has(url)) continue; // OPML 里同源出现两次，导入只取一次
    seen.add(url);
    entries.push({ url, title: attr(tag, "title") || attr(tag, "text") });
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { error: "文件里没找到订阅地址（outline 节点缺 xmlUrl 属性）" },
      { status: 400 },
    );
  }

  const db = getDb();
  let added = 0;
  let skipped = 0;
  for (const e of entries) {
    try {
      addFeed(db, { url: e.url, title: e.title || undefined });
      added++;
    } catch {
      // addFeed 对已存在的 url 抛错——导入场景里这就是「跳过」，不是失败
      skipped++;
    }
  }

  return NextResponse.json(
    { added, skipped, total: entries.length },
    { status: 201 },
  );
}
