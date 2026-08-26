// 订阅源集合路由：GET 列表 / POST 添加（添加成功后顺手抓第一轮）。
//
// 为什么 POST 要立即抓一次：用户加完订阅最想看到的是「文章进来了」，
// 让人等到下一个整点才见货，体验上等于功能坏了。

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { addFeed, listFeeds, refreshFeed } from "@/lib/feeds/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ feeds: listFeeds(getDb()) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须是 JSON 对象" }, { status: 400 });
  }

  const url = String((body as Record<string, unknown>).url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "请提供订阅地址 url" }, { status: 400 });
  }
  // 只接受 http(s) 链接：file:// 等协议在服务端 fetch 时没有意义还可能踩坑
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "订阅地址必须以 http:// 或 https:// 开头" },
      { status: 400 },
    );
  }

  // 提取成局部变量再 typeof 判断：TS 对「断言后的属性访问」直接内联
  // 三元时收窄会失效，抽出来既过类型检查又更好读
  const rawTitle = (body as Record<string, unknown>).title;

  try {
    const feed = addFeed(getDb(), {
      url,
      title: typeof rawTitle === "string" ? rawTitle : undefined,
    });

    // 添加成功立刻抓一轮；失败不影响「源已保存」，错误会记在该源身上
    let firstFetch: { added: number; skipped: number } | null = null;
    try {
      firstFetch = await refreshFeed(getDb(), feed);
    } catch {
      // 常见于：RSS 地址手滑写错、对方站点超时。列表页能看到 last_error
    }

    return NextResponse.json({ feed: getFeedRow(feed.id), firstFetch }, { status: 201 });
  } catch (err) {
    // addFeed 抛的重复/空地址错误 → 400；其余按服务器内部错误处理
    const msg = err instanceof Error ? err.message : String(err);
    const status =
      msg.includes("已存在") || msg.includes("不能为空") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

function getFeedRow(id: string) {
  // 小包装：避免在 JSON 里直接暴露 undefined 字段差异
  const rows = listFeeds(getDb());
  return rows.find((f) => f.id === id) ?? null;
}
