// 单个订阅源路由：PATCH 改启用状态 / DELETE 退订。

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { removeFeed, setFeedEnabled } from "@/lib/feeds/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "请求体必须是 { enabled: boolean }" },
      { status: 400 },
    );
  }

  const row = setFeedEnabled(getDb(), id, body.enabled);
  if (!row) {
    return NextResponse.json({ error: "订阅源不存在" }, { status: 404 });
  }
  return NextResponse.json({ feed: row });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ok = removeFeed(getDb(), id);
  if (!ok) {
    return NextResponse.json({ error: "订阅源不存在" }, { status: 404 });
  }
  // 已采集的文章保留在知识流里——退订只是「以后不抓了」，
  // 不追溯清理历史内容，这是数据安全上的默认选择
  return NextResponse.json({ ok: true });
}
