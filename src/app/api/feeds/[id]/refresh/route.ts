// 手动刷新单个订阅源：调试新源、等不及整点时用。
// 刷新结果直接返回（新增几篇/跳过几篇），失败把该源的 last_error 带回去。

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFeed, refreshFeed } from "@/lib/feeds/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const feed = getFeed(getDb(), id);
  if (!feed) {
    return NextResponse.json({ error: "订阅源不存在" }, { status: 404 });
  }

  try {
    const result = await refreshFeed(getDb(), feed);
    return NextResponse.json({ ...result, feed: getFeed(getDb(), id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `抓取失败: ${msg}`, feed: getFeed(getDb(), id) },
      { status: 502 }, // 上游（RSS 站点）的问题，用 502 比 500 更贴切
    );
  }
}
